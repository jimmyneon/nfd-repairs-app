import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import { PROFITABILITY_TRACKING_START, isTradingDate, londonDateKey } from '@/lib/profitability'

export const dynamic = 'force-dynamic'

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:nfdrepairs@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  try {
    const today = londonDateKey()
    // The cron runs at 15:30 UTC: 15:30 in winter and 16:30 in summer.
    // The in-app banner also appears from 16:00 London time, so the reminder
    // remains useful across GMT/BST without duplicate cron calls.
    if (today < PROFITABILITY_TRACKING_START || !isTradingDate(today)) {
      return NextResponse.json({ success: true, skipped: true })
    }

    const supabase = createServiceClient()
    const { data: entry, error: entryError } = await supabase
      .from('daily_profitability')
      .select('id')
      .eq('entry_date', today)
      .maybeSingle()

    if (entryError) throw entryError
    if (entry) {
      return NextResponse.json({ success: true, skipped: true, reason: 'already-entered' })
    }

    const body = `Today’s profitability entry (${today}) hasn’t been logged yet. Add revenue, parts, petty cash and job count.`

    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('title', 'Profitability entry due')
      .eq('body', body)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, skipped: true, reason: 'already-reminded' })
    }

    await supabase.from('notifications').insert({
      type: 'ACTION_REQUIRED',
      title: 'Profitability entry due',
      body,
      job_id: null,
      is_read: false,
    })

    let sent = 0
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')

      const payload = JSON.stringify({
        title: 'Profitability entry due',
        body: 'Add today’s figures — it should take under 30 seconds.',
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

    return NextResponse.json({ success: true, reminded: true, push_sent: sent })
  } catch (error) {
    console.error('Profitability reminder error:', error)
    return NextResponse.json({
      error: 'Failed to process profitability reminder',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
