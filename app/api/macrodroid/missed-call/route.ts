import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendViaMacroDroid, isWithinUKSendingHours } from '@/lib/resilience'

/**
 * POST /api/macrodroid/missed-call
 *
 * MacroDroid fires this webhook when an incoming call to the shop phone
 * goes unanswered. We text the caller back with a context-aware message:
 *   - custom closure (illness / emergency) → highest priority
 *   - special hours / holiday banner
 *   - currently open → "we're open until X" + quote/status links
 *   - currently closed → "we're closed, next open <day/time>" + links
 *
 * Expected payload (JSON or form-encoded):
 *   { from: "+447...", channel?: "sms" }
 *
 * The endpoint is unauthenticated (MacroDroid cannot sign requests) but is
 * guarded by:
 *   - UK mobile validation (international numbers are logged but not texted)
 *   - 1 response per 30 minutes per phone number (in-memory rate limit)
 *   - UK sending-hours window (8am-8pm) — outside hours we log but don't send
 */

// In-memory rate limit: phone → last-sent timestamp.
// Vercel serverless instances are short-lived, so this is a best-effort
// guard against duplicate texts within a single instance's lifetime.
const rateLimitStore = new Map<string, number>()
const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

// Fallback hours if Supabase is unreachable — matches /api/public/opening-hours
const FALLBACK_HOURS: Record<string, { isOpen: boolean; formatted: string; open?: string; close?: string }> = {
  Sunday:    { isOpen: false, formatted: 'Closed' },
  Monday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Tuesday:   { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Wednesday: { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Thursday:  { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Friday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Saturday:  { isOpen: true,  formatted: '10:00 AM - 3:00 PM', open: '10:00', close: '15:00' },
}

const DEFAULT_MAPS_URL = 'https://maps.app.goo.gl/AEfEr4ZRhjB8rVSC7'
const REPAIR_REQUEST_URL = 'nfdr.uk/start'
const START_URL = 'nfdr.uk/start'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    // Parse body — accept JSON or form-encoded (MacroDroid sends either)
    let from: string | undefined
    let channel = 'sms'
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await request.json()
      from = body.from || body.phone || body.caller
      channel = body.channel || 'sms'
    } else {
      const formData = await request.formData()
      from = (formData.get('from') || formData.get('phone') || formData.get('caller') || undefined) as string | undefined
      channel = (formData.get('channel') as string) || 'sms'
    }

    if (!from) {
      return NextResponse.json(
        { error: 'Missing required field: from' },
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    // Validate UK mobile — block international numbers to avoid SMS costs
    const ukCheck = isUkMobile(from)
    if (!ukCheck.ok) {
      console.log(`[missed-call] Blocked non-UK number: ${from} (${ukCheck.reason})`)
      return NextResponse.json(
        { success: true, blocked: true, reason: ukCheck.reason, message: 'Missed call logged; no SMS sent (non-UK)' },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    // Rate limit: 1 per 30 min per number
    const now = Date.now()
    const lastSent = rateLimitStore.get(from)
    if (lastSent && now - lastSent < RATE_LIMIT_WINDOW_MS) {
      const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastSent)) / 1000)
      console.log(`[missed-call] Rate limited ${from} (retry in ${retryAfterSec}s)`)
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded', retryAfter: retryAfterSec },
        { status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    // Respect UK sending-hours window (8am-8pm). Outside hours, log and exit.
    if (!isWithinUKSendingHours()) {
      console.log(`[missed-call] Outside UK sending hours — not texting ${from}`)
      rateLimitStore.set(from, now) // still count it so we don't fire on every retry
      return NextResponse.json(
        { success: true, skipped: true, reason: 'Outside UK sending hours' },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    // Pull hours + special hours + maps link from admin_settings
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let weeklyHours = FALLBACK_HOURS
    let specialHours: { active?: boolean; note?: string | null } | null = null
    let googleMapsUrl = DEFAULT_MAPS_URL

    try {
      const { data: settings } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['opening_hours', 'google_maps_link', 'special_hours'])

      if (settings && settings.length > 0) {
        for (const s of settings) {
          if (s.key === 'opening_hours' && s.value) {
            const parsed = typeof s.value === 'string' ? JSON.parse(s.value) : s.value
            if (parsed && typeof parsed === 'object') weeklyHours = parsed
          } else if (s.key === 'google_maps_link' && s.value) {
            googleMapsUrl = typeof s.value === 'string' ? s.value : String(s.value)
          } else if (s.key === 'special_hours' && s.value) {
            const parsed = typeof s.value === 'string' ? JSON.parse(s.value) : s.value
            if (parsed && typeof parsed === 'object') specialHours = parsed
          }
        }
      }
    } catch (e) {
      console.error('[missed-call] Failed to load admin_settings, using fallback hours:', e)
    }

    const status = computeHoursStatus(weeklyHours)

    // Build the message
    const message = buildMissedCallMessage({
      isOpen: status.isOpen,
      todayFormatted: status.todayFormatted,
      nextOpen: status.nextOpen,
      googleMapsUrl,
      specialHours,
    })

    // Send via MacroDroid
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      console.error('[missed-call] MACRODROID_WEBHOOK_URL not configured')
      return NextResponse.json(
        { success: false, error: 'SMS provider not configured' },
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    const sendResult = await sendViaMacroDroid(webhookUrl, from, message)

    // Log to sms_logs for audit trail
    try {
      await supabase.from('sms_logs').insert({
        template_key: 'MISSED_CALL',
        body_rendered: message,
        status: sendResult.ok ? 'SENT' : 'FAILED',
        sent_at: sendResult.ok ? new Date().toISOString() : null,
        error_message: sendResult.ok ? null : sendResult.body,
      } as any)
    } catch (e) {
      console.error('[missed-call] Failed to log to sms_logs:', e)
    }

    if (!sendResult.ok) {
      console.error('[missed-call] MacroDroid send failed:', sendResult.body)
      return NextResponse.json(
        { success: false, error: 'SMS send failed', details: sendResult.body },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }

    rateLimitStore.set(from, now)
    console.log(`[missed-call] Sent template to ${from}`)

    return NextResponse.json(
      { success: true, message, delivered: true, deliveryProvider: 'macrodroid' },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  } catch (error) {
    console.error('[missed-call] Handler error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to handle missed call' },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate that a phone number is a UK mobile. UK mobiles: +44 7... or 07... */
function isUkMobile(raw: string): { ok: boolean; reason?: string } {
  const digits = raw.replace(/[^\d+]/g, '')
  // +447XXXXXXXXX or 00447XXXXXXXXX or 07XXXXXXXXX
  if (/^\+447\d{9}$/.test(digits)) return { ok: true }
  if (/^00447\d{9}$/.test(digits)) return { ok: true }
  if (/^07\d{9}$/.test(digits)) return { ok: true }
  return { ok: false, reason: 'Not a UK mobile number' }
}

/** Compute isOpen / nextOpen / today formatted hours using Europe/London time. */
function computeHoursStatus(weeklyHours: Record<string, any>): {
  isOpen: boolean
  todayFormatted: string
  nextOpen: string | null
} {
  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // Use Europe/London so BST/GMT is handled correctly even though Vercel runs UTC.
  const ukParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekdayPart = ukParts.find(p => p.type === 'weekday')?.value || days[now.getDay()]
  const hourPart = ukParts.find(p => p.type === 'hour')?.value || String(now.getHours())
  const minutePart = ukParts.find(p => p.type === 'minute')?.value || String(now.getMinutes())

  // Map "Monday" etc. to our keys; Intl gives e.g. "Monday" already
  const currentDay = days.find(d => d.toLowerCase() === weekdayPart.toLowerCase()) || days[now.getDay()]
  const currentHour = parseInt(hourPart, 10)
  const currentMin = parseInt(minutePart, 10)
  const currentMins = currentHour * 60 + currentMin

  const todayHours = weeklyHours[currentDay] || FALLBACK_HOURS[currentDay]
  let isOpen = false
  if (todayHours?.isOpen && todayHours.open && todayHours.close) {
    const [openH, openM] = String(todayHours.open).split(':').map(Number)
    const [closeH, closeM] = String(todayHours.close).split(':').map(Number)
    isOpen = currentMins >= openH * 60 + openM && currentMins < closeH * 60 + closeM
  }

  // Find next open time if currently closed
  let nextOpen: string | null = null
  if (!isOpen) {
    const todayIdx = days.indexOf(currentDay)
    for (let i = 0; i <= 7; i++) {
      const checkIdx = (todayIdx + i) % 7
      const checkDay = days[checkIdx]
      const checkHours = weeklyHours[checkDay]
      if (checkHours?.isOpen && checkHours.open) {
        if (i === 0) {
          const [openH] = String(checkHours.open).split(':').map(Number)
          if (currentHour < openH) {
            nextOpen = `today at ${checkHours.open}`
            break
          }
        } else {
          nextOpen = `${checkDay} at ${checkHours.open}`
          break
        }
      }
    }
  }

  return {
    isOpen,
    todayFormatted: todayHours?.formatted || 'Closed',
    nextOpen,
  }
}

/** Build the context-aware missed-call SMS. */
function buildMissedCallMessage(ctx: {
  isOpen: boolean
  todayFormatted: string
  nextOpen: string | null
  googleMapsUrl: string
  specialHours: { active?: boolean; note?: string | null } | null
}): string {
  const lines: string[] = ['Sorry we missed your call!', '']

  // Special hours / holiday banner takes priority over regular hours
  if (ctx.specialHours?.active && ctx.specialHours.note) {
    lines.push(ctx.specialHours.note)
    lines.push('')
    lines.push('For repair quotes & appointments:')
    lines.push(REPAIR_REQUEST_URL)
    lines.push('')
    lines.push('Questions or status updates? Text us or visit:')
    lines.push(START_URL)
  } else if (ctx.isOpen) {
    const closeTime = extractCloseTime(ctx.todayFormatted)
    lines.push(`We're currently OPEN until ${closeTime}.`)
    lines.push('')
    lines.push(`Need help? Here's the quickest way:`)
    lines.push('')
    lines.push('REPAIR QUOTES & APPOINTMENTS:')
    lines.push(REPAIR_REQUEST_URL)
    lines.push('')
    lines.push('QUESTIONS & STATUS CHECKS:')
    lines.push(`Text us or visit: ${START_URL}`)
  } else {
    if (ctx.nextOpen) {
      lines.push(`We're currently closed. We'll be open ${ctx.nextOpen}.`)
    } else {
      lines.push(`We're currently closed. ${ctx.todayFormatted}`)
    }
    lines.push('')
    lines.push(`Need help? Here's the quickest way:`)
    lines.push('')
    lines.push('REPAIR QUOTES & APPOINTMENTS:')
    lines.push(REPAIR_REQUEST_URL)
    lines.push('')
    lines.push('QUESTIONS & STATUS CHECKS:')
    lines.push(`Text us or visit: ${START_URL}`)
  }

  // Use nfdr.uk/h for "Find us" — it redirects to Google Maps and is much shorter
  lines.push('')
  lines.push('Find us: nfdr.uk/h')

  lines.push('')
  lines.push('Many thanks,')
  lines.push('John — New Forest Device Repairs')

  return lines.join('\n')
}

/** Extract closing time from a formatted hours string like "10:00 AM - 5:00 PM". */
function extractCloseTime(hoursString: string): string {
  const match = hoursString.match(/-\s*(\d{1,2}:\d{2}\s*[AP]M)/i)
  return match ? match[1].trim() : hoursString
}
