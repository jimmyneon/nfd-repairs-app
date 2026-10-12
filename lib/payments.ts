import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe } from './stripe'

export type PaymentKind =
  | 'job_deposit'
  | 'job_payment'
  | 'enquiry_deposit'
  | 'enquiry_payment'
  | 'remote_support'
  | 'fund_topup'

export type CreatePaymentArgs = {
  kind: PaymentKind
  amountPence: number
  description: string
  jobId?: string | null
  enquiryRef?: string | null
  repairFundId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

export type CreatedPayment = {
  sessionId: string
  url: string
}

/**
 * Card is always offered. Klarna appears automatically when the order is
 * eligible (Klarna enforces its own min/max and customer checks) — small
 * deposits simply won't show it.
 */
const PAYMENT_METHODS: Array<'card' | 'klarna'> = ['card', 'klarna']

/**
 * Create a Stripe Checkout session and record it in the payments table.
 * The row starts life as 'open'; the Stripe webhook is the only thing that
 * flips it to 'paid'.
 */
export async function createPaymentCheckout(
  supabase: SupabaseClient,
  args: CreatePaymentArgs
): Promise<CreatedPayment> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe is not configured')
  if (!Number.isFinite(args.amountPence) || args.amountPence <= 0) {
    throw new Error('Invalid payment amount')
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: PAYMENT_METHODS,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: { name: args.description },
          unit_amount: args.amountPence,
        },
        quantity: 1,
      },
    ],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    customer_email: args.customerEmail || undefined,
    metadata: {
      kind: args.kind,
      ...(args.jobId ? { job_id: args.jobId } : {}),
      ...(args.enquiryRef ? { enquiry_ref: args.enquiryRef } : {}),
      ...(args.repairFundId ? { repair_fund_id: args.repairFundId } : {}),
      ...(args.metadata || {}),
    },
  })

  const { error } = await supabase.from('payments').insert({
    stripe_session_id: session.id,
    kind: args.kind,
    job_id: args.jobId ?? null,
    enquiry_ref: args.enquiryRef ?? null,
    repair_fund_id: args.repairFundId ?? null,
    amount_pence: args.amountPence,
    customer_name: args.customerName ?? null,
    customer_phone: args.customerPhone ?? null,
    customer_email: args.customerEmail ?? null,
    description: args.description,
    checkout_url: session.url,
    status: 'open',
  })
  if (error) throw new Error(`Failed to record payment: ${error.message}`)

  return { sessionId: session.id, url: session.url! }
}

/**
 * Find an open checkout session created for the same entity+kind that is
 * still fresh enough to reuse (Stripe sessions live ~24h). Lets repeated
 * taps on a pay link land on the same session instead of minting new ones.
 */
export async function findOpenPayment(
  supabase: SupabaseClient,
  match: { jobId?: string; enquiryRef?: string; repairFundId?: string },
  kind: PaymentKind
): Promise<{ url: string; sessionId: string } | null> {
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('payments')
    .select('stripe_session_id, checkout_url')
    .eq('kind', kind)
    .eq('status', 'open')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)

  if (match.jobId) query = query.eq('job_id', match.jobId)
  if (match.enquiryRef) query = query.eq('enquiry_ref', match.enquiryRef)
  if (match.repairFundId) query = query.eq('repair_fund_id', match.repairFundId)

  const { data } = await query
  const row = data?.[0]
  return row?.checkout_url
    ? { url: row.checkout_url, sessionId: row.stripe_session_id }
    : null
}
