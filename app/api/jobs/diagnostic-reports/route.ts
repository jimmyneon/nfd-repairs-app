import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import { REPORT_FIELDS, validateReport, reportSchemaUnavailable } from '@/lib/diagnostic-reports'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

async function staff(request: NextRequest) {
  const auth = await requireStaffUser(request)
  if (auth.response) return { response: auth.response }
  const db = createServiceClient()
  // Match the database's staff policy even when STAFF_EMAILS is unset.
  const { data, error } = await db.from('staff_allowlist').select('email')
    .eq('email', auth.user!.email?.toLowerCase() || '').maybeSingle()
  if (error || !data) return { response: NextResponse.json({ error: 'Staff access required' }, { status: 403 }) }
  return { db }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await staff(request)
    if (auth.response) return auth.response
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (!jobId) return NextResponse.json({ error: 'Job required' }, { status: 400 })
    const { data, error } = await auth.db!.from('job_diagnostic_reports').select(REPORT_FIELDS)
      .eq('job_id', jobId).order('created_at', { ascending: false }).order('id', { ascending: false })
    if (reportSchemaUnavailable(error)) {
      const { data: job, error: jobError } = await auth.db!.from('jobs').select('diagnostic_report').eq('id', jobId).maybeSingle()
      if (jobError) throw jobError
      return NextResponse.json({ draft: null, published: null, versions: 0, migrationReady: false,
        legacyDraft: job?.diagnostic_report || '' }, { headers })
    }
    if (error) throw error
    return NextResponse.json({ draft: data?.find(r => !r.published_at) || null,
      published: data?.find(r => r.published_at) || null, versions: data?.filter(r => r.published_at).length || 0, migrationReady: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'Reports unavailable. Please try again.' }, { status: 503, headers })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await staff(request)
    if (auth.response) return auth.response
    const body = await request.json()
    const report = validateReport(body)
    if (!report || typeof body.jobId !== 'string' || !['draft', 'publish'].includes(body.action)) {
      return NextResponse.json({ error: 'Enter a title and diagnostic findings.' }, { status: 400 })
    }
    if (body.action === 'publish' && (!report.conclusion || !report.recommendations || !report.outcome)) {
      return NextResponse.json({ error: 'Add a conclusion, recommendations and outcome before publishing.' }, { status: 400 })
    }
    const db = auth.db!
    const { data: job, error: jobError } = await db.from('jobs')
      .select('id,job_ref,device_make,device_model,customer_name').eq('id', body.jobId).maybeSingle()
    if (jobError) throw jobError
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    // A single transaction serialises saves per job; published rows are immutable snapshots.
    const { error } = await db.rpc('save_job_diagnostic_report', {
      p_job_id: job.id, p_report: report, p_publish: body.action === 'publish',
    })
    if (reportSchemaUnavailable(error) && body.action === 'draft') {
      // Rolling deployment: keep the original private text save operational
      // until the additive migration is applied. Never pretend to publish.
      const { error: saveError } = await db.from('jobs').update({ diagnostic_report: report.report_text }).eq('id', job.id)
      if (saveError) throw saveError
      return NextResponse.json({ success: true, legacyDraft: true }, { headers })
    }
    if (reportSchemaUnavailable(error)) return NextResponse.json({ error: 'Publishing needs the diagnostic report database migration. Your existing private report is preserved.' }, { status: 503, headers })
    if (error) throw error
    return NextResponse.json({ success: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'Report could not be saved. Please try again.' }, { status: 503, headers })
  }
}
