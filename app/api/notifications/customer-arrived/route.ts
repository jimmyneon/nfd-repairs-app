import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * API endpoint for customer "I'm Here" notification
 * POST /api/notifications/customer-arrived
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { jobId, jobRef, customerLatitude, customerLongitude, distanceMeters } = await request.json()

    if (!jobId || !jobRef) {
      return NextResponse.json(
        { error: 'Job ID and reference required' },
        { status: 400 }
      )
    }

    // Update job with customer arrival timestamp
    await supabase
      .from('jobs')
      .update({ customer_arrived_at: new Date().toISOString() })
      .eq('id', jobId)

    // Create notification in database
    await supabase.from('notifications').insert({
      type: 'CUSTOMER_ARRIVED',
      title: `Customer here for ${jobRef}`,
      body: `Customer is at the shop (${distanceMeters}m away) ready to collect their device.`,
      job_id: jobId,
    })

    // Send push notification to all subscribed devices
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')

    if (subscriptions && subscriptions.length > 0) {
      // Send web push notifications
      const webpush = require('web-push')
      
      // Set VAPID details (these should be in environment variables)
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          'mailto:repairs@nfdrepairs.co.uk',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        )

        const payload = JSON.stringify({
          title: `🔔 Customer Arrived`,
          body: `${jobRef} - Customer is here to collect their device`,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: `customer-arrived-${jobId}`,
          data: {
            url: `/app/jobs/${jobId}?customer_arrived=true`,
            jobId,
            jobRef,
            action: 'mark_collected'
          },
          actions: [
            {
              action: 'mark_collected',
              title: 'Mark as Collected'
            },
            {
              action: 'view_job',
              title: 'View Job'
            }
          ]
        })

        // Send to all subscriptions
        const pushPromises = subscriptions.map(sub => {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }
          return webpush.sendNotification(pushSubscription, payload)
            .catch((error: any) => {
              console.error('Push notification failed:', error)
              // If subscription is invalid, remove it
              if (error.statusCode === 410) {
                supabase.from('push_subscriptions').delete().eq('id', sub.id)
              }
            })
        })

        await Promise.allSettled(pushPromises)
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Team notified successfully'
    })

  } catch (error) {
    console.error('Error sending customer arrival notification:', error)
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
