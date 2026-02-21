import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import webpush from 'web-push'

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:nfdrepairs@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function POST(request: NextRequest) {
  try {
    const { title, body, url, jobId } = await request.json()

    if (!title || !body) {
      return NextResponse.json(
        { error: 'Missing title or body' },
        { status: 400 }
      )
    }

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')

    if (error || !subscriptions) {
      console.error('Failed to fetch subscriptions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      )
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/app/jobs',
      jobId,
    })

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        )
        return { success: true, userId: sub.user_id }
      } catch (error) {
        console.error(`Failed to send to ${sub.user_id}:`, error)
        
        // If subscription is invalid, remove it
        if ((error as any).statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', sub.user_id)
        }
        
        return { success: false, userId: sub.user_id, error }
      }
    })

    const results = await Promise.all(sendPromises)
    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
      success: true,
      sent: successCount,
      total: subscriptions.length,
      results,
    })
  } catch (error) {
    console.error('Error sending push notifications:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
