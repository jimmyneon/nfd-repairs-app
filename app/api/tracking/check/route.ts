import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { trackPackage } from '@/lib/trackers'

/**
 * POST /api/tracking/check
 * Manually fetches the latest tracking info by scraping the carrier website.
 * Called by staff via the "Check Again" button on the job detail page.
 *
 * Body: { jobId: string }
 */

export async function POST(request: NextRequest) {
  try {
    const { jobId, carrierOverride } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get the tracking number from the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_ref, parts_tracking_number, parts_tracking_carrier')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!job.parts_tracking_number) {
      return NextResponse.json({ error: 'No tracking number on this job' }, { status: 400 })
    }

    const trackingNumber = job.parts_tracking_number

    console.log(`🔍 Tracking check for ${job.job_ref}: ${trackingNumber}${carrierOverride ? ` (carrier override: ${carrierOverride})` : ''}`)

    const result = await trackPackage(trackingNumber, undefined, carrierOverride)

    console.log(`✅ Tracking result: ${result.status} - ${result.lastEvent}`)

    const status = result.status
    const eventDescription = result.lastEvent
    const eventLocation = result.lastLocation
    const eta = result.eta

    // Update job with fresh tracking data
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

    await supabase.from('jobs').update(updateData).eq('id', jobId)

    // Log the manual check
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Manual tracking check (${result.carrier}): ${status} - ${eventDescription}${eventLocation ? ` (${eventLocation})` : ''}`,
    })

    // If delivered, auto-update to PARTS_ARRIVED
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single()

    if (status === 'Delivered' && currentJob?.status === 'PARTS_ORDERED') {
      await supabase
        .from('jobs')
        .update({
          status: 'PARTS_ARRIVED',
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'STATUS_CHANGE',
        message: 'Status changed to Parts Arrived (auto - manual tracking check shows delivered)',
      })

      // Queue SMS
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
        await fetch(`${appUrl}/api/jobs/queue-status-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, status: 'PARTS_ARRIVED' }),
        })
      } catch (smsError) {
        console.error(`Failed to queue PARTS_ARRIVED SMS for ${job.job_ref}:`, smsError)
      }
    }

    return NextResponse.json({
      success: true,
      carrier: result.carrier,
      status,
      event: eventDescription,
      location: eventLocation,
      eta,
      autoChangedToPartsArrived: status === 'Delivered' && currentJob?.status === 'PARTS_ORDERED',
    })
  } catch (error) {
    console.error('Error in tracking check:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
