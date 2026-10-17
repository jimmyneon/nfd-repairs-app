import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.cookies.get('repair_token')?.value
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: link } = await db.from('magic_links').select('repair_id,expires_at,used')
    .eq('token', token).eq('repair_id', params.id).eq('used', true).maybeSingle()
  if (!link || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const { data: reports, error } = await db.from('repair_diagnostic_reports')
    .select('id,title,report_text,published_at').eq('repair_id', params.id)
    .not('published_at', 'is', null).order('published_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Reports unavailable' }, { status: 500 })
  const reportId = request.nextUrl.searchParams.get('report')
  const report = reports?.find(r => r.id === reportId)
  if (reportId && !report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (report && request.nextUrl.searchParams.get('download') === '1') {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>body{font:16px Arial,sans-serif;max-width:760px;margin:48px auto;line-height:1.6;color:#182b21}
h1{color:#087844}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:20mm}}</style></head>
<body><h1>${escapeHtml(report.title)}</h1><p>New Forest Device Repairs</p><p>Published: ${escapeHtml(String(report.published_at).slice(0,10))}</p>
<hr><pre>${escapeHtml(report.report_text)}</pre></body></html>`
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="diagnostic-report.html"', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff' } })
  }
  return NextResponse.json({ reports: reports ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
