import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * POST /api/tracking/webhook
 * Receives push notifications from 17TRACK when tracking status changes.
 *
 * 17TRACK sends two event types:
 * - TRACKING_UPDATED: contains full tracking info (status, events, ETA)
 * - TRACKING_STOPPED: tracking has stopped updating
 *
 * The webhook URL must be set in 17TRACK dashboard:
 * https://api.17track.net/admin/settings
 * Set it to: https://nfd-repairs-app.vercel.app/api/tracking/webhook
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const sign = request.headers.get('sign') || ''

    // Verify webhook signature if API key is configured
    const apiKey = process.env.TRACKING_17TRACK_API_KEY
    if (apiKey) {
      const expectedSign = crypto
        .createHmac('sha256', apiKey)
        .update(body)
        .digest('hex')
      if (sign !== expectedSign) {
        console.error('17TRACK webhook signature mismatch')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body)
    const event = payload.event
    const data = payload.data

    if (!event || !data) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const trackingNumber = data.number

    if (event === 'TRACKING_STOPPED') {
      // Find job by tracking number and update status
      const { data: job } = await supabase
        .from('jobs')
        .select('id, job_ref')
        .eq('parts_tracking_number', trackingNumber)
        .single()

      if (job) {
        await supabase
          .from('jobs')
          .update({
            parts_tracking_status: 'Stopped',
            parts_tracking_updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: `17TRACK tracking stopped for ${trackingNumber}`,
        })
      }

      return NextResponse.json({ success: true })
    }

    if (event === 'TRACKING_UPDATED') {
      const trackInfo = data.track_info || {}
      const latestStatus = trackInfo.latest_status || {}
      const latestEvent = trackInfo.latest_event || {}
      const timeMetrics = trackInfo.time_metrics || {}

      const status = latestStatus.status || 'Unknown'
      const eventDescription = latestEvent.description || ''
      const eventLocation = latestEvent.location || ''
      const eventTime = latestEvent.time_utc || null

      // Extract ETA if available
      let eta: string | null = null
      if (timeMetrics.estimated_delivery_date) {
        const etaObj = timeMetrics.estimated_delivery_date
        if (etaObj.from) {
          eta = etaObj.from
        } else if (etaObj.to) {
          eta = etaObj.to
        }
      }

      // Find job by tracking number
      const { data: job } = await supabase
        .from('jobs')
        .select('id, job_ref, status')
        .eq('parts_tracking_number', trackingNumber)
        .single()

      if (!job) {
        console.log(`No job found for tracking number ${trackingNumber}`)
        return NextResponse.json({ success: true, message: 'No matching job' })
      }

      // Update job with tracking info
      const updateData: any = {
        parts_tracking_status: status,
        parts_tracking_last_event: eventDescription,
        parts_tracking_last_location: eventLocation,
        parts_tracking_updated_at: new Date().toISOString(),
      }

      if (eta) {
        updateData.parts_tracking_eta = eta
      }

      // If carrier was detected, save it
      if (data.carrier) {
        updateData.parts_tracking_carrier = String(data.carrier)
      }

      await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', job.id)

      // Log the tracking update event
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Parts tracking update: ${status} - ${eventDescription}${eventLocation ? ` (${eventLocation})` : ''}`,
      })

      // If delivered, auto-update job status to PARTS_ARRIVED if still PARTS_ORDERED
      if (status === 'Delivered' && job.status === 'PARTS_ORDERED') {
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
          message: 'Status changed to Parts Arrived (auto - tracking shows delivered)',
        })

        // Queue SMS notification for PARTS_ARRIVED
        try {
          await fetch('https://nfd-repairs-app.vercel.app/api/jobs/queue-status-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id, status: 'PARTS_ARRIVED' }),
          })
        } catch (smsError) {
          console.error(`Failed to queue PARTS_ARRIVED SMS for ${job.job_ref}:`, smsError)
        }

        console.log(`Auto-changed ${job.job_ref} to PARTS_ARRIVED (tracking delivered)`)
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true, message: `Unhandled event: ${event}` })
  } catch (error) {
    console.error('Error in tracking webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
