import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { trackPackage } from '@/lib/trackers'

/**
 * GET /api/tracking/sync
 * Cron endpoint - runs daily via pg_cron
 *
 * Scrapes carrier websites (Royal Mail, DPD, Evri) for tracking updates
 * on all jobs with a tracking number that are still in PARTS_ORDERED status.
 *
 * Requires CRON_SECRET environment variable.
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
    let errorCount = 0

    // Process each job individually (scraping, not batch API)
    for (const job of jobs) {
      try {
        console.log(`🔍 Sync tracking for ${job.job_ref}: ${job.parts_tracking_number}`)
        const result = await trackPackage(job.parts_tracking_number)

        const status = result.status
        const eventDescription = result.lastEvent
        const eventLocation = result.lastLocation
        const eta = result.eta

        const updateData: any = {
          parts_tracking_status: status,
          parts_tracking_last_event: eventDescription,
          parts_tracking_last_location: eventLocation,
          parts_tracking_updated_at: new Date().toISOString(),
          parts_tracking_carrier: result.carrier,
        }

        if (eta) {
          updateData.parts_tracking_eta = eta
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
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
            await fetch(`${appUrl}/api/jobs/queue-status-sms`, {
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
          trackingNumber: job.parts_tracking_number,
          carrier: result.carrier,
          status,
          event: eventDescription,
        })

        // Rate limit: wait 2 seconds between requests to be polite to carrier websites
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (err) {
        console.error(`Error tracking ${job.job_ref}:`, err)
        errorCount++
        results.push({
          jobRef: job.job_ref,
          trackingNumber: job.parts_tracking_number,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      totalJobs: jobs.length,
      updated: updatedCount,
      errors: errorCount,
      results,
    })
  } catch (error) {
    console.error('Error in tracking sync:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
