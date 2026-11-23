import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from './api-auth'
import { createServiceClient } from './resilience'
import {
  BillingSettings,
  DEFAULT_BILLING,
  Invoice,
  invoiceTotal,
  todayUK,
} from './invoices'
import { jobPaymentState } from './job-payment-state'
import { invoicePdf } from './invoice-pdf'
import { invoiceHtml } from './invoice-template'
import { Resend } from 'resend'
import { getAppUrl } from './utils'

export const invoiceHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}
export async function invoiceStaff(request: NextRequest) {
  const auth = await requireStaffUser(request)
  if (auth.response) return { response: auth.response }
  const db = createServiceClient()
  const { data, error } = await db
    .from('staff_allowlist')
    .select('email')
    .eq('email', auth.user!.email?.toLowerCase() || '')
    .maybeSingle()
  if (error || !data)
    return {
      response: NextResponse.json(
        { error: 'Staff access required' },
        { status: 403 },
      ),
    }
  return { db }
}
export async function billingSettings(
  db: SupabaseClient,
): Promise<BillingSettings> {
  const { data, error } = await db
    .from('billing_settings')
    .select('data')
    .eq('id', true)
    .single()
  if (error) throw error
  return { ...DEFAULT_BILLING, ...data.data }
}
export async function loadInvoice(
  db: SupabaseClient,
  id: string,
): Promise<Invoice> {
  const { data, error } = await db
    .from('billing_invoices')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return withInvoicePayments(db, data)
}
/** Job payments remain live; item lines and issuer details are a fixed snapshot. */
export async function withInvoicePayments(
  db: SupabaseClient,
  invoice: Invoice,
): Promise<Invoice> {
  if (!invoice.job_id) return invoice
  const { data: job, error } = await db
    .from('jobs')
    .select('payment_received,deposit_received,deposit_amount')
    .eq('id', invoice.job_id)
    .single()
  if (error) throw error
  const { data: enquiry, error: enquiryError } = await db
    .from('enquiries')
    .select('enquiry_ref')
    .eq('converted_job_id', invoice.job_id)
    .maybeSingle()
  if (enquiryError) throw enquiryError
  const { data: rows, error: paymentError } = await db
    .from('payments')
    .select('amount_pence,kind')
    .eq('status', 'paid')
    .eq('currency', 'gbp')
    .or(
      enquiry
        ? `job_id.eq.${invoice.job_id},enquiry_ref.eq.${enquiry.enquiry_ref}`
        : `job_id.eq.${invoice.job_id}`,
    )
  if (paymentError) throw paymentError
  const total = invoiceTotal(invoice.payload)
  const state = jobPaymentState(
    { ...job, price_total: total / 100 },
    rows || [],
  )
  return {
    ...invoice,
    paid_pence: job.payment_received ? Math.max(total, state.paid) : state.paid,
  }
}
export async function jobInvoice(db: SupabaseClient, jobId: string) {
  const { data: id, error } = await db.rpc('billing_job_invoice', {
    p_job_id: jobId,
  })
  if (error) throw error
  return id ? loadInvoice(db, id) : null
}
export async function invoiceResponse(request: NextRequest, invoice: Invoice) {
  const format = request.nextUrl.searchParams.get('format')
  if (format === 'pdf')
    return new NextResponse(Buffer.from(await invoicePdf(invoice)), {
      headers: {
        ...invoiceHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.number || 'NFDR-draft'}.pdf"`,
      },
    })
  if (format === 'html')
    return new NextResponse(invoiceHtml(invoice), {
      headers: {
        ...invoiceHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      },
    })
  // Explicit allowlist: capability keys, leases and delivery errors remain private.
  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        payload: invoice.payload,
        paid_pence: invoice.paid_pence,
      },
    },
    { headers: invoiceHeaders },
  )
}
export const invoiceUrl = (i: Invoice) =>
  `${getAppUrl()}/api/invoices/public/${i.public_token}?format=pdf`
export async function sendInvoice(
  db: SupabaseClient,
  id: string,
  resend = false,
) {
  if (!process.env.RESEND_API_KEY)
    throw Error('Email service is not configured.')
  const initial = await loadInvoice(db, id)
  if (!initial.payload.customer_email)
    throw Error('Add a customer email address before sending.')
  if (initial.status !== 'issued')
    throw Error('Issue the invoice before sending.')
  const { data: claimed, error: claimError } = await db.rpc(
    'billing_claim_email',
    { p_id: id, p_resend: resend },
  )
  if (claimError) throw claimError
  if (!claimed)
    return {
      sent: false,
      message: 'Already sent or a delivery is in progress.',
    }
  try {
    const i = await loadInvoice(db, id)
    const email = new Resend(process.env.RESEND_API_KEY)
    const { error } = await email.emails.send(
      {
        from: 'New Forest Device Repairs <repairs@newforestdevicerepairs.co.uk>',
        to: [i.payload.customer_email],
        subject: `Invoice ${i.number} — ${i.payload.title}`,
        html: invoiceHtml(i, invoiceUrl(i)),
        attachments: [
          {
            filename: `${i.number}.pdf`,
            content: Buffer.from(await invoicePdf(i)),
          },
        ],
      },
      {
        idempotencyKey: `invoice/${id}/${(i as any).email_attempt_started_at}`,
      },
    )
    if (error) throw Error(error.message)
    const { error: recordError } = await db
      .from('billing_invoices')
      .update({
        sent_at: new Date().toISOString(),
        email_error: null,
        email_lock_until: null,
      })
      .eq('id', id)
    if (recordError) throw recordError
    return { sent: true }
  } catch (error) {
    await db
      .from('billing_invoices')
      .update({
        email_error: String((error as Error).message).slice(0, 1000),
        email_lock_until: null,
      })
      .eq('id', id)
    throw error
  }
}
export async function generateRecurring(db: SupabaseClient) {
  const today = todayUK()
  const { data: series, error } = await db
    .from('billing_series')
    .select('id,auto_email')
    .eq('active', true)
    .lte('next_date', today)
    .order('next_date')
    .limit(10)
  if (error) throw error
  const results: { id: string; invoiceId?: string; error?: string }[] = []
  for (const s of series || []) {
    try {
      const { data: id, error: generateError } = await db.rpc(
        'billing_generate_occurrence',
        { p_series_id: s.id, p_today: today },
      )
      if (generateError) throw generateError
      if (id && s.auto_email) await sendInvoice(db, id)
      results.push({ id: s.id, invoiceId: id })
    } catch (e) {
      results.push({ id: s.id, error: (e as Error).message })
    }
  }
  // Retry missed/failed delivery without generating a duplicate invoice. Do not
  // resend older uncertain attempts after the provider's 24h idempotency window.
  const { data: pending, error: pendingError } = await db
    .from('billing_invoices')
    .select('id,series_id,email_attempt_started_at,created_at')
    .eq('status', 'issued')
    .is('sent_at', null)
    .not('series_id', 'is', null)
    .order('created_at')
    .limit(10)
  if (pendingError) throw pendingError
  for (const i of pending || []) {
    const { data: s, error: seriesError } = await db
      .from('billing_series')
      .select('auto_email')
      .eq('id', i.series_id)
      .single()
    if (seriesError) throw seriesError
    if (
      s?.auto_email &&
      (!i.email_attempt_started_at ||
        Date.now() - Date.parse(i.email_attempt_started_at) <
          23 * 60 * 60 * 1000)
    ) {
      try {
        await sendInvoice(db, i.id)
      } catch (e) {
        results.push({
          id: i.series_id,
          invoiceId: i.id,
          error: (e as Error).message,
        })
      }
    }
  }
  return results
}
