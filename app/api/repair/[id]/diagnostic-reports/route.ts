import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { diagnosticPdf } from '@/lib/diagnostic-pdf'
import { reportSchemaUnavailable } from '@/lib/diagnostic-reports'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = request.cookies.get('repair_token')?.value
    if (!token) return NextResponse.json({ error: 'Not authorised' }, { status: 401, headers })
    const db = createServiceClient()
    const { data: link } = await db.from('magic_links').select('repair_id,expires_at,used')
      .eq('token', token).eq('repair_id', params.id).eq('used', true).maybeSingle()
    if (!link || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) {
      return NextResponse.json({ error: 'Access expired. Please request a fresh link.' }, { status: 401, headers })
    }
    const { data: reports, error } = await db.from('repair_diagnostic_reports')
      .select('id,title,report_text,published_at').eq('repair_id', params.id)
      .not('published_at', 'is', null).order('published_at', { ascending: false })
    if (reportSchemaUnavailable(error)) return NextResponse.json({ reports: [] }, { headers })
    if (error) throw error
    const { data: repair, error: repairError } = await db.from('repairs')
      .select('customer_name,device_type,device_model').eq('id', params.id).maybeSingle()
    if (repairError) throw repairError
    const mapped = (reports || []).map(report => ({ ...report, conclusion: '', recommendations: '', outcome: '',
      job_ref: params.id, customer_name: repair?.customer_name || '',
      device: [repair?.device_type, repair?.device_model].filter(Boolean).join(' ') }))
    const reportId = request.nextUrl.searchParams.get('report')
    const report = reportId ? mapped.find(r => r.id === reportId) : mapped[0]
    if (reportId && !report) return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
    if (request.nextUrl.searchParams.get('download') === '1') {
      if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
      return new NextResponse(Buffer.from(await diagnosticPdf(report)), { headers: { ...headers,
        'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="NFD-diagnostic-report.pdf"' } })
    }
    return NextResponse.json({ reports: mapped }, { headers })
  } catch {
    return NextResponse.json({ error: 'Reports unavailable. Please try again.' }, { status: 503, headers })
  }
}
