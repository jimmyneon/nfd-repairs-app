import { NextRequest, NextResponse } from 'next/server'
import {
  invoiceStaff,
  billingSettings,
  invoiceHeaders,
  loadInvoice,
} from '@/lib/invoice-service'
import { Invoice, validateInvoice } from '@/lib/invoices'
import { recurringPreview } from '@/lib/invoice-editor'
import { invoiceHtml } from '@/lib/invoice-template'
import { invoicePdf } from '@/lib/invoice-pdf'
import { sendEmail } from '@/lib/email'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  try {
    const auth = await invoiceStaff(request)
    if (auth.response) return auth.response
    if (
      !(await checkRateLimit(getClientIP(request), 'invoice:preview', 10))
        .allowed
    )
      return NextResponse.json(
        { error: 'Please wait a moment before creating another preview.' },
        { status: 429, headers: invoiceHeaders },
      )
    const body = await request.json()
    if (!['pdf', 'email'].includes(body.format))
      throw Error('Choose PDF or email preview.')
    let invoice: Invoice
    if (typeof body.invoiceId === 'string') {
      invoice = await loadInvoice(auth.db!, body.invoiceId)
    } else {
      let payload = validateInvoice(body.payload)
      if (body.schedule) payload = recurringPreview(payload, body.schedule)
      payload.seller = await billingSettings(auth.db!)
      invoice = {
        id: 'preview',
        number: null,
        status: 'draft',
        payload,
        job_id: null,
        series_id: null,
        occurrence_date: null,
        paid_pence: 0,
        sent_at: null,
        email_error: null,
        created_at: '',
      }
    }
    const pdf = Buffer.from(await invoicePdf(invoice))
    if (body.format === 'pdf')
      return new NextResponse(pdf, {
        headers: {
          ...invoiceHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            'attachment; filename="NFDR-invoice-preview.pdf"',
        },
      })
    const to = auth.user!.email
    if (!to)
      throw Error(
        'Your signed-in staff account needs an email address for previews.',
      )
    const sent = await sendEmail(
      to,
      'Invoice preview — ' + invoice.payload.title,
      invoiceHtml(invoice),
      undefined,
      [{ filename: 'NFDR-invoice-preview.pdf', content: pdf }],
    )
    if (!sent.success)
      throw Error(
        'The preview email could not be sent. Your invoice is unchanged.',
      )
    return NextResponse.json({ sent: true, to }, { headers: invoiceHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400, headers: invoiceHeaders },
    )
  }
}
