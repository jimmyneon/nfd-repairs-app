import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

// Service-to-service alerts from the HDMI site edge functions (e.g. low
// Parcel2Go PrePay balance). Bearer HDMI_STAFF_SECRET — same shared secret
// the dispatch/refund proxies already use. Not staff-session authed because
// the caller is a cron, not a browser.
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:ps5hdmirepair@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function POST(request: NextRequest) {
  const secret = process.env.HDMI_STAFF_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const { title, body, url } = await request.json().catch(() => ({}))
  if (typeof title !== 'string' || typeof body !== 'string' || !title || !body) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  const supabase = createServiceClient()
  const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('*')
  if (error || !subscriptions) {
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
  }

  const payload = JSON.stringify({
    title: title.slice(0, 120),
    body: body.slice(0, 300),
    url: typeof url === 'string' && url.startsWith('/') ? url : '/app/jobs',
    type: 'HDMI_ALERT',
    timestamp: Date.now(),
  })

  let sent = 0
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent++
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('user_id', sub.user_id)
      }
    }
  }
  return NextResponse.json({ sent, total: subscriptions.length })
}
