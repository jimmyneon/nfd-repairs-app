import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// Use service role key to bypass RLS when fetching subscriptions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Configure web-push with VAPID keys
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:nfdrepairs@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
} else {
  console.error('VAPID keys not configured! Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables')
}

export async function POST(request: NextRequest) {
  try {
    // Check if VAPID keys are configured
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured')
      return NextResponse.json(
        { error: 'Push notifications not configured. VAPID keys missing.' },
        { status: 500 }
      )
    }

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

    // Determine notification type based on title or body content
    let notificationType = 'default'
    if (title.includes('Parts Arrived') || body.includes('Parts Arrived')) {
      notificationType = 'PARTS_ARRIVED'
    } else if (title.includes('Ready to Collect') || body.includes('Ready to Collect')) {
      notificationType = 'READY_TO_COLLECT'
    } else if (title.includes('New Job') || title.includes('Job Created')) {
      notificationType = 'NEW_JOB'
    } else if (title.includes('Warranty Claim') || title.includes('WARRANTY')) {
      notificationType = 'WARRANTY_CLAIM'
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/app/jobs',
      jobId,
      type: notificationType,
      timestamp: Date.now()
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
