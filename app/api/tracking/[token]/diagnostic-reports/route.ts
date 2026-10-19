import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { REPORT_FIELDS, reportSchemaUnavailable } from '@/lib/diagnostic-reports'
import { diagnosticPdf } from '@/lib/diagnostic-pdf'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const limit = await checkRateLimit(getClientIP(request), 'tracking:reports', 30)
    if (!limit.allowed) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429, headers })
    if (!params.token || params.token.length < 10 || params.token.length > 64) {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 400, headers })
    }
    const db = createServiceClient()
    const { data: job, error: jobError } = await db.from('jobs').select('id')
      .eq('tracking_token', params.token).maybeSingle()
    if (jobError) throw jobError
    if (!job) return NextResponse.json({ error: 'Tracking link not found. Please contact us for help.' }, { status: 404, headers })
    // The long tracking token authorises this job's reports for the record's lifetime.
    // Normal tracking expiry, status and drafts never participate in this query.
    const reportId = request.nextUrl.searchParams.get('report')
    let query = db.from('job_diagnostic_reports').select(REPORT_FIELDS)
      .eq('job_id', job.id)
    if (reportId) query = query.eq('id', reportId)
    const { data, error } = await query
      .order('published_at', { ascending: false }).order('id', { ascending: false })
    if (reportSchemaUnavailable(error)) {
      return request.nextUrl.searchParams.get('download') === '1'
        ? NextResponse.json({ error: 'Published report not found' }, { status: 404, headers })
        : NextResponse.json({ reports: [] }, { headers })
    }
    if (error) throw error
    // Drafts are staff-only; filter in code so a NULL published_at can never leak.
    const report = (data || []).find(r => r.published_at)
    if (request.nextUrl.searchParams.get('download') === '1') {
      if (!report) return NextResponse.json({ error: 'Published report not found' }, { status: 404, headers })
      return new NextResponse(Buffer.from(await diagnosticPdf(report)), { headers: {
        ...headers, 'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="NFD-diagnostic-report.pdf"',
      } })
    }
    return NextResponse.json({ reports: report ? [report] : [] }, { headers })
  } catch {
    return NextResponse.json({ error: 'Reports are temporarily unavailable. Please try again.' }, { status: 503, headers })
  }
}
