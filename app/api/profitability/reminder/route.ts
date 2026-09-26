import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import {
  PROFITABILITY_TRACKING_START,
  dateOffsetKey,
  isTradingDate,
  londonDateKey,
} from '@/lib/profitability'
import { loadProfitabilityStorage } from '@/lib/profitability-storage'

export const dynamic = 'force-dynamic'

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:nfdrepairs@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

function missingTradingDates(entries: Array<{ entry_date: string }>, today: string) {
  const present = new Set(entries.map(entry => entry.entry_date))
  const result: string[] = []

  for (let offset = 0; offset >= -20 && result.length < 8; offset--) {
    const key = dateOffsetKey(today, offset)
    if (key < PROFITABILITY_TRACKING_START) break
    if (!isTradingDate(key)) continue
    if (!present.has(key)) result.push(key)
  }

  return result
}

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  })
}

function isMissingNotificationLinkColumn(error: any) {
  if (!error) return false
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return String(error?.code || '') === 'PGRST204' && text.includes('link') ||
    text.includes("could not find the 'link' column") ||
    text.includes('column "link"')
}

export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  try {
    const today = londonDateKey()
    if (today < PROFITABILITY_TRACKING_START) {
      return NextResponse.json({ success: true, skipped: true, reason: 'tracking-not-started' })
    }

    const supabase = createServiceClient()
    const from = dateOffsetKey(today, -20)
    const { entries } = await loadProfitabilityStorage(supabase, from, today)
    const missingDates = missingTradingDates(entries, today)

    if (missingDates.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'nothing-missing' })
    }

    // Vercel can retry a cron invocation. Only create one reminder per London
    // calendar day, while still allowing a fresh reminder tomorrow if entries
    // remain outstanding.
    const { data: existing, error: existingError } = await supabase
      .from('notifications')
      .select('id')
      .eq('title', 'Profitability entry due')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .limit(1)
      .maybeSingle()

    if (existingError) throw existingError

    if (existing) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already-reminded-today',
        missing_dates: missingDates,
      })
    }

    const dateSummary = missingDates
      .slice(0, 4)
      .map(prettyDate)
      .join(', ')
    const extra = missingDates.length > 4 ? ` +${missingDates.length - 4} more` : ''
    const body = missingDates.length === 1
      ? `Profitability figures still need entering for ${dateSummary}. Add revenue, parts, petty cash and job count.`
      : `${missingDates.length} profitability days still need entering: ${dateSummary}${extra}. Add the missing figures when you can.`

    const notification = {
      type: 'ACTION_REQUIRED',
      title: 'Profitability entry due',
      body,
      job_id: null,
      link: '/app/profitability',
      is_read: false,
    }

    let { error: notificationError } = await supabase
      .from('notifications')
      .insert(notification)

    // Keep the reminder working even if the optional notification link
    // migration has not been applied yet.
    if (notificationError && isMissingNotificationLinkColumn(notificationError)) {
      const { link: _link, ...withoutLink } = notification
      const retry = await supabase.from('notifications').insert(withoutLink)
      notificationError = retry.error
    }

    if (notificationError) throw notificationError

    let sent = 0
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')

      const payload = JSON.stringify({
        title: 'Profitability entry due',
        body: missingDates.length === 1
          ? `1 day still needs completing — tap to enter it.`
          : `${missingDates.length} days still need completing — tap to fill them in.`,
        url: '/app/profitability',
        type: 'ACTION_REQUIRED',
        timestamp: Date.now(),
      })

      for (const sub of subscriptions || []) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          }, payload)
          sent++
        } catch (error: any) {
          if (error?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('Profitability push failed:', error)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      reminded: true,
      missing_dates: missingDates,
      push_sent: sent,
    })
  } catch (error: any) {
    const details = String(error?.message || error?.details || error?.code || error || 'Unknown error')
    console.error('Profitability reminder error:', error)
    return NextResponse.json({
      error: 'Failed to process profitability reminder',
      details,
    }, { status: 500 })
  }
}
