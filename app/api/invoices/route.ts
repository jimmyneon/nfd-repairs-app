import { NextRequest, NextResponse } from 'next/server'
import {
  invoiceHeaders,
  invoiceStaff,
  jobInvoice,
  billingSettings,
} from '@/lib/invoice-service'
import { bankReady, validateInvoice } from '@/lib/invoices'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const auth = await invoiceStaff(request)
    if (auth.response) return auth.response
    const db = auth.db!
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (jobId)
      return NextResponse.json(
        { invoice: await jobInvoice(db, jobId) },
        { headers: invoiceHeaders },
      )
    const { data, error } = await db
      .from('billing_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ invoices: data }, { headers: invoiceHeaders })
  } catch {
    return NextResponse.json(
      { error: 'Invoices are unavailable. Please try again.' },
      { status: 503, headers: invoiceHeaders },
    )
  }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await invoiceStaff(request)
    if (auth.response) return auth.response
    const body = await request.json(),
      payload = validateInvoice(body.payload)
    if (!['save', 'issue'].includes(body.action))
      throw Error('Choose save or issue.')
    const settings = await billingSettings(auth.db!)
    if (
      body.action === 'issue' &&
      payload.payment_method === 'bank_transfer' &&
      !bankReady(settings)
    )
      throw Error('Add bank details in Invoice settings before issuing.')
    const { data: id, error } = await auth.db!.rpc('billing_save_invoice', {
      p_id: body.id || null,
      p_payload: payload,
      p_issue: body.action === 'issue',
    })
    if (error)
      throw Error(
        'Invoice could not be saved. Issued invoices cannot be edited.',
      )
    return NextResponse.json({ id }, { headers: invoiceHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400, headers: invoiceHeaders },
    )
  }
}
