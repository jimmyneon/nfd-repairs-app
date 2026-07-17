import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/tracking/sync
 * Cron endpoint - runs daily via pg_cron
 *
 * Polls 17TRACK for tracking updates on all jobs with a tracking number
 * that are still in PARTS_ORDERED status. This is a backup to the webhook
 * in case webhook pushes fail.
 *
 * Requires TRACKING_17TRACK_API_KEY environment variable.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify cron secret
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.TRACKING_17TRACK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'TRACKING_17TRACK_API_KEY not configured' }, { status: 500 })
    }

    // Find all jobs in PARTS_ORDERED with a tracking number
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_ref, parts_tracking_number, parts_tracking_carrier')
      .eq('status', 'PARTS_ORDERED')
      .not('parts_tracking_number', 'is', null)

    if (error) {
      console.error('Error fetching jobs for tracking sync:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, message: 'No jobs to sync', count: 0 })
    }

    const results: any[] = []
    let updatedCount = 0

    // 17TRACK allows 40 tracking numbers per request
    const batchSize = 40
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize)

      // Build request payload
      const trackingItems = batch.map((job: any) => ({
        number: job.parts_tracking_number,
        ...(job.parts_tracking_carrier ? { carrier: parseInt(job.parts_tracking_carrier) } : {}),
      }))

      try {
        const response = await fetch('https://api.17track.net/track/v2.4/gettrackinfo', {
          method: 'POST',
          headers: {
            '17token': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(trackingItems),
        })

        const result = await response.json()

        if (result.code !== 0) {
          console.error('17TRACK gettrackinfo error:', result)
          continue
        }

        // Process each tracking result
        const accepted = result.data?.accepted || []
        for (const trackData of accepted) {
          const trackingNumber = trackData.number
          const job = batch.find((j: any) => j.parts_tracking_number === trackingNumber)
          if (!job) continue

          const trackInfo = trackData.track_info || {}
          const latestStatus = trackInfo.latest_status || {}
          const latestEvent = trackInfo.latest_event || {}
          const timeMetrics = trackInfo.time_metrics || {}

          const status = latestStatus.status || 'Unknown'
          const eventDescription = latestEvent.description || ''
          const eventLocation = latestEvent.location || ''

          let eta: string | null = null
          if (timeMetrics.estimated_delivery_date) {
            const etaObj = timeMetrics.estimated_delivery_date
            if (etaObj.from) {
              eta = etaObj.from
            } else if (etaObj.to) {
              eta = etaObj.to
            }
          }

          const updateData: any = {
            parts_tracking_status: status,
            parts_tracking_last_event: eventDescription,
            parts_tracking_last_location: eventLocation,
            parts_tracking_updated_at: new Date().toISOString(),
          }

          if (eta) {
            updateData.parts_tracking_eta = eta
          }

          if (trackData.carrier) {
            updateData.parts_tracking_carrier = String(trackData.carrier)
          }

          await supabase
            .from('jobs')
            .update(updateData)
            .eq('id', job.id)

          // If delivered, auto-update to PARTS_ARRIVED
          if (status === 'Delivered') {
            await supabase
              .from('jobs')
              .update({
                status: 'PARTS_ARRIVED',
                status_changed_at: new Date().toISOString(),
              })
              .eq('id', job.id)

            await supabase.from('job_events').insert({
              job_id: job.id,
              type: 'STATUS_CHANGE',
              message: 'Status changed to Parts Arrived (auto - tracking sync shows delivered)',
            })

            // Queue SMS
            try {
              await fetch('https://nfd-repairs-app.vercel.app/api/jobs/queue-status-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId: job.id, status: 'PARTS_ARRIVED' }),
              })
            } catch (smsError) {
              console.error(`Failed to queue PARTS_ARRIVED SMS for ${job.job_ref}:`, smsError)
            }
          }

          updatedCount++
          results.push({
            jobRef: job.job_ref,
            trackingNumber,
            status,
            event: eventDescription,
          })
        }

        // Rate limit: 3 requests per second
        if (i + batchSize < jobs.length) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (err) {
        console.error('Error fetching tracking batch:', err)
      }
    }

    return NextResponse.json({
      success: true,
      totalJobs: jobs.length,
      updated: updatedCount,
      results,
    })
  } catch (error) {
    console.error('Error in tracking sync:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
