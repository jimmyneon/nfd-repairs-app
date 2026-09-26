import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry } from '@/lib/resilience'
import crypto from 'crypto'
import { isTrackingLinkExpired } from '@/lib/job-utils'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { JOB_STATUS_LABELS } from '@/lib/constants'

/**
 * Public tracking data endpoint.
 *
 * Returns job data, events, and page view counts for a tracking token.
 * Uses the service role key (bypasses RLS) so customers can view their
 * tracking page without logging in.
 *
 * SECURITY: Returns ONLY customer-safe fields for the single job matching
 * the token. It never returns customer name, phone, email, address,
 * device passcode, internal diagnosis notes, delay/cancellation notes,
 * staff notes, or any token value. Link expiry is enforced.
 *
 * GET /api/tracking/[token]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Rate limit: tracking page polls every 30s, so allow 30/min per IP.
    const ip = getClientIP(request)
    const rl = await checkRateLimit(ip, 'tracking:get', 30)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const token = params.token
    // Only accept the long tracking_token (≥10 chars). Short tokens
    // (6-8 chars, 24-bit) are too weak for a capability link and are
    // resolved server-side by the /t/[token] page wrapper, never by
    // this API.
    if (!token || token.length < 10 || token.length > 64) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Fetch only the job row matching this LONG tracking token, selecting
    // ONLY customer-safe fields. Free-text fields that could contain PII,
    // staff notes, passcodes, serial numbers, addresses, or sensitive
    // diagnosis details are deliberately excluded:
    //   - customer_notes: staff-written free text, could contain PII
    //   - diagnostic_report: diagnosis details, could be sensitive
    //   - description: customer free text, could contain PII/passcodes
    //   - job_ref: internal reference, not needed by the customer
    //   - delay_notes, cancellation_notes, diagnosis_notes: internal
    //   - tracking_token, short_token: capability keys, never exposed
    const { data: job, error }: any = await supabaseRetry(() =>
      supabase
        .from('jobs')
        .select(`
          id, status,
          device_make, device_model, issue,
          created_at, status_changed_at,
          parts_required, deposit_required,
          source,
          tracking_link_expires_at,
          closed_at, show_tracking_to_customer,
          parts_tracking_status,
          repair_agreed_at,
          device_in_shop
        `)
        .eq('tracking_token', token)
        .maybeSingle()
    )

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check if tracking link has expired
    if (isTrackingLinkExpired(job.tracking_link_expires_at)) {
      return NextResponse.json({ error: 'Tracking link expired', expired: true }, { status: 410 })
    }

    // Strip the expiry timestamp from the public response — it is an
    // internal field only needed server-side for the expiry check above.
    delete job.tracking_link_expires_at

    // Fetch job events (status changes). We parse the raw message
    // server-side and return ONLY the derived status key + timestamp —
    // the raw `message` field is staff-authored free text and must never
    // be sent to the browser.
    const { data: rawEvents }: any = await supabaseRetry(() =>
      supabase
        .from('job_events')
        .select('created_at, message')
        .eq('job_id', job.id)
        .eq('type', 'STATUS_CHANGE')
        .order('created_at', { ascending: false })
        .limit(10)
    )

    const statusLabelToKey: Record<string, string> = {}
    for (const [key, label] of Object.entries(JOB_STATUS_LABELS)) {
      statusLabelToKey[label] = key
    }
    const events = (rawEvents || []).map((e: any) => {
      const match = typeof e.message === 'string'
        ? e.message.match(/Status changed to (.+?)(?:\s*-|$)/)
        : null
      const label = match ? match[1].trim() : null
      return { created_at: e.created_at, status: label ? statusLabelToKey[label] ?? null : null }
    })

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
