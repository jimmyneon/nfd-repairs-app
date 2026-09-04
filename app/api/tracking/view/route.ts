import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry } from '@/lib/resilience'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, trackingToken } = body

    if (!jobId && !trackingToken) {
      return NextResponse.json({ error: 'jobId or trackingToken required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    let resolvedJobId = jobId

    // If only token provided, look up job ID
    if (!resolvedJobId && trackingToken) {
      const { data } = await supabaseRetry(() =>
        supabase
          .from('jobs')
          .select('id')
          .eq('tracking_token', trackingToken)
          .maybeSingle()
      )
      if (!data) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      resolvedJobId = data.id
    }

    // Get user agent and hash an IP for deduplication (privacy-preserving)
    const userAgent = request.headers.get('user-agent') || ''
    const forwarded = request.headers.get('x-forwarded-for') || ''
    const ipHash = forwarded
      ? crypto.createHash('sha256').update(forwarded.split(',')[0]).digest('hex').substring(0, 16)
      : null

    // Insert page view
    await supabaseRetry(() =>
      supabase.from('tracking_page_views').insert({
        job_id: resolvedJobId,
        viewed_at: new Date().toISOString(),
        user_agent: userAgent.substring(0, 200),
        ip_hash: ipHash,
      })
    )

    // Get visit counts for response
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ count: totalVisits }, { count: visitsLastHour }, { count: visitsLast24h }] = await Promise.all([
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', resolvedJobId)),
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', resolvedJobId).gte('viewed_at', oneHourAgo)),
      supabaseRetry(() => supabase.from('tracking_page_views').select('*', { count: 'exact', head: true }).eq('job_id', resolvedJobId).gte('viewed_at', twentyFourHoursAgo)),
    ])

    return NextResponse.json({
      success: true,
      totalVisits: totalVisits || 0,
      visitsLastHour: visitsLastHour || 0,
      visitsLast24h: visitsLast24h || 0,
    })
  } catch (error) {
    console.error('Error logging page view:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
