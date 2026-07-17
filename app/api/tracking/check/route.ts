import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/tracking/check
 * Manually fetches the latest tracking info from 17TRACK for a single tracking number.
 * Called by staff via the "Check Again" button on the job detail page.
 *
 * Body: { jobId: string }
 */

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const apiKey = process.env.TRACKING_17TRACK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'TRACKING_17TRACK_API_KEY not configured' }, { status: 500 })
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

    // Fetch tracking info from 17TRACK
    const trackingItems: any[] = [{ number: job.parts_tracking_number }]
    if (job.parts_tracking_carrier) {
      trackingItems[0].carrier = parseInt(job.parts_tracking_carrier)
    }

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
      return NextResponse.json({ error: '17TRACK API error', details: result }, { status: 400 })
    }

    const accepted = result.data?.accepted || []
    if (accepted.length === 0) {
      return NextResponse.json({ error: 'No tracking data returned' }, { status: 404 })
    }

    const trackData = accepted[0]
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

    // Update job with fresh tracking data
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

    await supabase.from('jobs').update(updateData).eq('id', jobId)

    // Log the manual check
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Manual tracking check: ${status} - ${eventDescription}${eventLocation ? ` (${eventLocation})` : ''}`,
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
        await fetch('https://nfd-repairs-app.vercel.app/api/jobs/queue-status-sms', {
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
      status,
      event: eventDescription,
      location: eventLocation,
      eta,
      carrier: trackData.carrier ? String(trackData.carrier) : job.parts_tracking_carrier,
      autoChangedToPartsArrived: status === 'Delivered' && currentJob?.status === 'PARTS_ORDERED',
    })
  } catch (error) {
    console.error('Error in tracking check:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
