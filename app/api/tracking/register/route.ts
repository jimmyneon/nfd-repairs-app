import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/tracking/register
 * Registers a tracking number with 17TRACK API so we receive webhook updates.
 *
 * Body: { jobId: string, trackingNumber: string }
 *
 * Requires TRACKING_17TRACK_API_KEY environment variable.
 * Get a free API key at https://api.17track.net (200 free tracking numbers)
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, trackingNumber } = await request.json()

    if (!jobId || !trackingNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId and trackingNumber' },
        { status: 400 }
      )
    }

    const apiKey = process.env.TRACKING_17TRACK_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'TRACKING_17TRACK_API_KEY not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Register the tracking number with 17TRACK
    const response = await fetch('https://api.17track.net/track/v2.4/register', {
      method: 'POST',
      headers: {
        '17token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ number: trackingNumber }]),
    })

    const result = await response.json()

    if (result.code !== 0) {
      console.error('17TRACK registration error:', result)
      return NextResponse.json(
        { error: '17TRACK registration failed', details: result },
        { status: 400 }
      )
    }

    const accepted = result.data?.accepted || []
    const rejected = result.data?.rejected || []

    if (accepted.length > 0) {
      const carrier = String(accepted[0].carrier || '')

      // Save carrier info to job
      await supabase
        .from('jobs')
        .update({
          parts_tracking_carrier: carrier,
          parts_tracking_updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      // Log event
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Tracking number ${trackingNumber} registered with 17TRACK (carrier: ${carrier})`,
      })

      return NextResponse.json({
        success: true,
        carrier,
        message: `Tracking number registered with 17TRACK`,
      })
    }

    if (rejected.length > 0) {
      return NextResponse.json(
        { error: 'Tracking number rejected by 17TRACK', details: rejected[0]?.error },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, message: 'Already registered' })
  } catch (error) {
    console.error('Error in tracking register:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
