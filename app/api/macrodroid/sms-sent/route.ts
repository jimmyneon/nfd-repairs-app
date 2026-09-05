import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * POST /api/macrodroid/sms-sent
 *
 * Receives a notification from MacroDroid's "Track my AMN SMS" macro whenever
 * an SMS is sent FROM the shop phone. This includes:
 *   - Manual texts John sends from his phone
 *   - Automated texts the repair app sent via the MacroDroid webhook
 *
 * This endpoint ONLY LOGS the sent message — it does NOT re-send it.
 * The SMS has already gone out from the phone; we're just recording it for
 * audit trail and so delivery confirmations can match against it later.
 *
 * Accepts both JSON and form-encoded payloads (MacroDroid sends form-encoded).
 *
 * Expected payload:
 *   {
 *     phone / customerPhone: string,   // recipient phone number
 *     message / text: string,          // the message that was sent
 *     sender?: string,                 // who sent it (staff / system / ai)
 *     timestamp?: string,              // when it was sent
 *     conversationId?: string          // legacy field, ignored
 *   }
 */
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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Parse body — MacroDroid sends form-encoded, but accept JSON too
    const rawBody = await request.text()
    let phone: string | undefined
    let message: string | undefined
    let sender: string | undefined
    let timestamp: string | undefined

    if (rawBody.includes('=') && (rawBody.includes('&') || !rawBody.includes('{'))) {
      // Form-encoded
      const params = new URLSearchParams(rawBody)
      phone = params.get('phone') || params.get('customerPhone') || params.get('customerphone') || undefined
      message = params.get('message') || params.get('text') || undefined
      sender = params.get('sender') || undefined
      timestamp = params.get('timestamp') || undefined
    } else {
      // JSON
      try {
        const body = JSON.parse(rawBody)
        phone = body.phone || body.customerPhone
        message = body.message || body.text
        sender = body.sender
        timestamp = body.timestamp
      } catch {
        return NextResponse.json(
          { error: 'Invalid request format — send JSON or form-encoded' },
          { status: 400 }
        )
      }
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Missing required field: message (or text)' },
        { status: 400 }
      )
    }

    if (!phone) {
      console.warn('[sms-sent] No phone provided, logging with null recipient')
    }

    // Normalise phone
    const normalisedPhone = phone ? normaliseUkPhone(phone) || phone.trim() : null
    const messageHash = crypto.createHash('sha256').update(message).digest('hex').substring(0, 16)
    const sentAt = parseTimestamp(timestamp) || new Date().toISOString()

    // Try to match this to a job by phone (for the job_id field)
    let jobId: string | null = null
    if (normalisedPhone) {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('customer_phone', normalisedPhone)
        .order('created_at', { ascending: false })
        .limit(1)

      if (jobs && jobs.length > 0) {
        jobId = jobs[0].id
      }
    }

    // Check if we already logged this exact message recently (dedup)
    // MacroDroid sometimes fires twice
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('message_hash', messageHash)
      .gte('created_at', fiveMinutesAgo)
      .limit(1)

    if (existing && existing.length > 0) {
      console.log('[sms-sent] Duplicate detected, skipping')
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'Already logged',
      })
    }

    // Insert the log
    const { error: logError } = await supabase.from('sms_logs').insert({
      job_id: jobId,
      template_key: sender === 'system' ? 'SYSTEM_OUTBOUND' : 'STAFF_MANUAL',
      body_rendered: message,
      status: 'SENT',
      sent_at: sentAt,
      recipient_phone: normalisedPhone,
      message_hash: messageHash,
    } as any)

    if (logError) {
      console.error('[sms-sent] Failed to log:', logError)
      // Don't fail the request — MacroDroid will retry and cause duplicates
      return NextResponse.json({
        success: true,
        warning: 'Logged with warning',
        error: logError.message,
      })
    }

    // If matched to a job, also add a job event
    if (jobId) {
      try {
        await supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SMS_SENT',
          message: `Outbound SMS: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
        })
      } catch (e) {
        console.error('[sms-sent] Job event insert failed:', e)
      }
    }

    console.log(`[sms-sent] Logged SMS to ${normalisedPhone || 'unknown'} (${message.length} chars)`)

    return NextResponse.json({
      success: true,
      logged: true,
      job_matched: !!jobId,
    })
  } catch (error) {
    console.error('[sms-sent] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function normaliseUkPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return null
}

function parseTimestamp(ts?: string): string | null {
  if (!ts) return null
  if (/^\d+$/.test(ts)) {
    return new Date(parseInt(ts) * 1000).toISOString()
  }
  try {
    return new Date(ts).toISOString()
  } catch {
    return null
  }
}
