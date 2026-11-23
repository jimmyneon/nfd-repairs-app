import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import {
  invoiceHeaders,
  invoiceResponse,
  jobInvoice,
} from '@/lib/invoice-service'
export const dynamic = 'force-dynamic'
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    if (
      !(await checkRateLimit(getClientIP(request), 'invoice:tracking', 20))
        .allowed
    )
      return NextResponse.json(
        { error: 'Please try again shortly.' },
        { status: 429, headers: invoiceHeaders },
      )
    if (!params.token || params.token.length < 10 || params.token.length > 64)
      return NextResponse.json(
        { error: 'Invalid tracking link.' },
        { status: 404, headers: invoiceHeaders },
      )
    const db = createServiceClient(),
      { data: job, error } = await db
        .from('jobs')
        .select('id')
        .eq('tracking_token', params.token)
        .maybeSingle()
    if (error) throw error
    if (!job)
      return NextResponse.json(
        { error: 'Tracking link not found.' },
        { status: 404, headers: invoiceHeaders },
      )
    const invoice = await jobInvoice(db, job.id)
    if (!invoice || invoice.status === 'draft')
      return NextResponse.json({ invoice: null }, { headers: invoiceHeaders })
    return await invoiceResponse(request, invoice)
  } catch {
    return NextResponse.json(
      { error: 'Invoice unavailable. Please try again.' },
      { status: 503, headers: invoiceHeaders },
    )
  }
}
