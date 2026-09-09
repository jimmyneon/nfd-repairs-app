import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry } from '@/lib/resilience'
import crypto from 'crypto'
import { isTrackingLinkExpired } from '@/lib/job-utils'

/**
 * Public tracking data endpoint.
 *
 * Returns job data, events, and page view counts for a tracking token.
 * Uses the service role key (bypasses RLS) so customers can view their
 * tracking page without logging in.
 *
 * Only returns data for the job matching the token — no personal data
 * is exposed (no customer name, phone, email, or address).
 *
 * GET /api/tracking/[token]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token
    if (!token || token.length < 4 || token.length > 64) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Fetch job by tracking_token or short_token
    const { data: job, error }: any = await supabaseRetry(() =>
      supabase
        .from('jobs')
        .select(`
          id, job_ref, tracking_token, short_token, status,
          device_make, device_model, issue, description,
          created_at, status_changed_at,
          parts_required, deposit_required,
          source, delay_reason, delay_notes,
          cancellation_reason, cancellation_notes,
          customer_notes, tracking_link_expires_at,
          closed_at, show_tracking_to_customer,
          parts_tracking_status,
          repair_agreed_at, repair_declined_at,
          diagnosis_notes, diagnostic_report,
          device_in_shop
        `)
        .or(`tracking_token.eq.${token},short_token.eq.${token}`)
        .maybeSingle()
    )

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check if tracking link has expired
    if (isTrackingLinkExpired(job.tracking_link_expires_at)) {
      return NextResponse.json({ error: 'Tracking link expired', expired: true }, { status: 410 })
    }

    // Fetch job events (status changes)
    const { data: events }: any = await supabaseRetry(() =>
      supabase
        .from('job_events')
        .select('created_at, message')
        .eq('job_id', job.id)
        .eq('type', 'STATUS_CHANGE')
        .order('created_at', { ascending: false })
        .limit(10)
    )

    // Log page view (privacy-preserving — hashed IP only)
    const userAgent = request.headers.get('user-agent') || ''
    const forwarded = request.headers.get('x-forwarded-for') || ''
    const ipHash = forwarded
      ? crypto.createHash('sha256').update(forwarded.split(',')[0]).digest('hex').substring(0, 16)
      : null

    await supabaseRetry(() =>
      supabase.from('tracking_page_views').insert({
        job_id: job.id,
        viewed_at: new Date().toISOString(),
        user_agent: userAgent.substring(0, 200),
        ip_hash: ipHash,
      })
    )

    // Fetch page view counts
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: views }: any = await supabaseRetry(() =>
      supabase
        .from('tracking_page_views')
        .select('viewed_at')
        .eq('job_id', job.id)
        .order('viewed_at', { ascending: false })
        .limit(50)
    )

    const [{ count: totalVisits }, { count: visitsLastHour }, { count: visitsLast24h }]: any = await Promise.all([
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', job.id)),
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', job.id).gte('viewed_at', oneHourAgo)),
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', job.id).gte('viewed_at', twentyFourHoursAgo)),
    ])

    // Fetch shop coordinates for "I'm here" button
    const { data: settings }: any = await supabaseRetry(() =>
      supabase
        .from('admin_settings')
        .select('shop_latitude, shop_longitude, gps_radius_meters')
        .limit(1)
        .single()
    )

    return NextResponse.json({
      job,
      events: events || [],
      views: views || [],
      visitCounts: {
        totalVisits: totalVisits || 0,
        visitsLastHour: visitsLastHour || 0,
        visitsLast24h: visitsLast24h || 0,
      },
      shopCoordinates: settings ? {
        latitude: settings.shop_latitude || 50.7558,
        longitude: settings.shop_longitude || -1.9626,
        radius: settings.gps_radius_meters || 100,
      } : null,
    })
  } catch (error) {
    console.error('[api/tracking/[token]] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
