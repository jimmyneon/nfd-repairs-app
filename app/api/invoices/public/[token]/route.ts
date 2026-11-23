import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import {
  invoiceHeaders,
  invoiceResponse,
  withInvoicePayments,
} from '@/lib/invoice-service'
export const dynamic = 'force-dynamic'
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    if (
      !(await checkRateLimit(getClientIP(request), 'invoice:public', 20))
        .allowed
    )
      return NextResponse.json(
        { error: 'Please try again shortly.' },
        { status: 429, headers: invoiceHeaders },
      )
    if (!/^[a-f0-9]{64}$/.test(params.token))
      return NextResponse.json(
        { error: 'Invalid invoice link.' },
        { status: 404, headers: invoiceHeaders },
      )
    const db = createServiceClient(),
      { data, error } = await db
        .from('billing_invoices')
        .select('*')
        .eq('public_token', params.token)
        .neq('status', 'draft')
        .maybeSingle()
    if (error) throw error
    if (!data)
      return NextResponse.json(
        { error: 'Invoice not found.' },
        { status: 404, headers: invoiceHeaders },
      )
    return await invoiceResponse(request, await withInvoicePayments(db, data))
  } catch {
    return NextResponse.json(
      { error: 'Invoice unavailable. Please contact us for a copy.' },
      { status: 503, headers: invoiceHeaders },
    )
  }
}
