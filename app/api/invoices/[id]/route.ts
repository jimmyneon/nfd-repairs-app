import { NextRequest, NextResponse } from 'next/server'
import {
  invoiceHeaders,
  invoiceStaff,
  invoiceResponse,
  loadInvoice,
  sendInvoice,
} from '@/lib/invoice-service'
export const dynamic = 'force-dynamic'
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await invoiceStaff(request)
    if (auth.response) return auth.response
    return await invoiceResponse(
      request,
      await loadInvoice(auth.db!, params.id),
    )
  } catch {
    return NextResponse.json(
      { error: 'Invoice not found.' },
      { status: 404, headers: invoiceHeaders },
    )
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await invoiceStaff(request)
    if (auth.response) return auth.response
    const db = auth.db!,
      body = await request.json(),
      i = await loadInvoice(db, params.id)
    if (body.action === 'send')
      return NextResponse.json(
        await sendInvoice(db, i.id, body.resend === true),
        { headers: invoiceHeaders },
      )
    if (body.action === 'void') {
      if (i.status !== 'issued')
        throw Error('Only issued invoices can be voided.')
      const { error } = await db
        .from('billing_invoices')
        .update({ status: 'void' })
        .eq('id', i.id)
        .eq('status', 'issued')
      if (error) throw error
    } else if (body.action === 'payment') {
      if (i.job_id) throw Error('Record repair payments on the repair job.')
      if (
        i.status !== 'issued' ||
        !Number.isSafeInteger(body.paid_pence) ||
        body.paid_pence < 0 ||
        body.paid_pence > 100000000
      )
        throw Error('Enter a valid amount received.')
      const { error } = await db
        .from('billing_invoices')
        .update({ paid_pence: body.paid_pence })
        .eq('id', i.id)
        .eq('status', 'issued')
      if (error) throw error
    } else throw Error('Unknown action.')
    return NextResponse.json({ success: true }, { headers: invoiceHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400, headers: invoiceHeaders },
    )
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await invoiceStaff(request)
  if (auth.response) return auth.response
  const { data, error } = await auth
    .db!.from('billing_invoices')
    .delete()
    .eq('id', params.id)
    .eq('status', 'draft')
    .select('id')
  if (error || !data?.length)
    return NextResponse.json(
      { error: 'Only drafts can be deleted.' },
      { status: 400 },
    )
  return NextResponse.json({ success: true }, { headers: invoiceHeaders })
}
