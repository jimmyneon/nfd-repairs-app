import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 *
 * Stripe's source-of-truth callback. Signature is verified with
 * STRIPE_WEBHOOK_SECRET — this route is the ONLY writer of 'paid' status
 * on payments, and it cascades the side effects (deposit_received flags,
 * job events, fund balances, confirmation SMS).
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) {
    console.error('[Stripe webhook] Not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Raw body is required for signature verification
  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: any) {
    console.error('[Stripe webhook] Bad signature:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSessionCompleted(
          supabase,
          event.data.object as Stripe.Checkout.Session
        )
        break

      case 'checkout.session.expired':
        await markBySession(
          supabase,
          (event.data.object as Stripe.Checkout.Session).id,
          'expired'
        )
        break

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        await supabase
          .from('payments')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)
          .eq('status', 'open')
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const piId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id
        if (piId) {
          const { data: payment } = await supabase
            .from('payments')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', piId)
            .select('id, job_id')
            .single()
          if (payment?.job_id) {
            await supabase.from('job_events').insert({
              job_id: payment.job_id,
              type: 'SYSTEM',
              message: 'Stripe payment refunded — review job before continuing',
            })
          }
        }
        break
      }

      default:
        // Unhandled events are acknowledged so Stripe stops retrying
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Stripe webhook] Handler error:', error)
    // 500 → Stripe retries, which is what we want for transient failures
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

async function markBySession(
  supabase: ReturnType<typeof createServiceClient>,
  sessionId: string,
  status: 'expired' | 'failed'
) {
  await supabase
    .from('payments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('stripe_session_id', sessionId)
    .eq('status', 'open')
}

async function handleSessionCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session
) {
  const now = new Date().toISOString()
  const metadataKind = (session.metadata?.kind || 'remote_support') as string
  const piId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  // Sessions created via /api/payments/checkout already have a row whose
  // entity links are authoritative — only flip status, never overwrite links
  // from metadata (a malformed metadata value must not break the cascade).
  // Side effects only run on the open→paid transition: Stripe can deliver
  // events more than once, and fund increments must not double-count.
  const { data: updatedRows, error: updateErr } = await supabase
    .from('payments')
    .update({
      stripe_payment_intent_id: piId,
      status: 'paid',
      paid_at: now,
      updated_at: now,
      amount_pence: session.amount_total ?? 0,
      customer_email: session.customer_details?.email ?? null,
    })
    .eq('stripe_session_id', session.id)
    .eq('status', 'open')
    .select('id, job_id, enquiry_ref, repair_fund_id, amount_pence, kind')

  if (updateErr) throw updateErr

  type PaymentRow = {
    id: string
    job_id: string | null
    enquiry_ref: string | null
    repair_fund_id: string | null
    amount_pence: number
    kind: string
    status?: string
  } | null

  let payment: PaymentRow = updatedRows?.[0] ?? null
  let ranTransition = Boolean(payment)

  if (!payment) {
    // Either a redelivery (row already terminal) or a session we didn't
    // create — distinguish by fetching the row.
    const { data: existing } = await supabase
      .from('payments')
      .select('id, job_id, enquiry_ref, repair_fund_id, amount_pence, kind, status')
      .eq('stripe_session_id', session.id)
      .maybeSingle()

    if (existing) {
      payment = existing
    } else {
      // Session created outside /api/payments/checkout (e.g. remote support)
      // — record it from metadata.
      const { data: inserted, error: insertErr } = await supabase
        .from('payments')
        .insert({
          stripe_session_id: session.id,
          stripe_payment_intent_id: piId,
          kind: metadataKind,
          job_id: session.metadata?.job_id || null,
          enquiry_ref: session.metadata?.enquiry_ref || null,
          repair_fund_id: session.metadata?.repair_fund_id || null,
          amount_pence: session.amount_total ?? 0,
          currency: session.currency ?? 'gbp',
          status: 'paid',
          paid_at: now,
          updated_at: now,
          customer_email: session.customer_details?.email ?? null,
        })
        .select('id, job_id, enquiry_ref, repair_fund_id, amount_pence, kind')
        .single()

      if (insertErr) {
        // Unique violation = a concurrent delivery already recorded it.
        if (insertErr.code === '23505') {
          const { data: raced } = await supabase
            .from('payments')
            .select('id, job_id, enquiry_ref, repair_fund_id, amount_pence, kind, status')
            .eq('stripe_session_id', session.id)
            .maybeSingle()
          payment = raced
        } else {
          throw insertErr
        }
      } else {
        payment = inserted
        ranTransition = true
      }
    }
  }

  const kind = payment?.kind || metadataKind
  const jobId = payment?.job_id || session.metadata?.job_id || null
  const enquiryRef = payment?.enquiry_ref || session.metadata?.enquiry_ref || null
  const fundId =
    payment?.repair_fund_id || session.metadata?.repair_fund_id || null
  const amountPence = payment?.amount_pence ?? session.amount_total ?? 0

  // ---- Side effects per kind — only on the open→paid transition ----
  if (ranTransition && kind === 'job_deposit' && jobId) {
    await supabase
      .from('jobs')
      .update({
        deposit_received: true,
        deposit_received_at: now,
        updated_at: now,
      })
      .eq('id', jobId)
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Deposit of £${(amountPence / 100).toFixed(2)} paid via Stripe`,
    })
    await sendDepositReceivedSms(supabase, jobId, amountPence)
  }

  if (ranTransition && (kind === 'job_payment' || kind === 'job_deposit') && jobId) {
    // A job is fully paid when the running total covers the price —
    // including anything paid earlier against its source enquiry.
    const { data: job } = await supabase
      .from('jobs')
      .select('price_total')
      .eq('id', jobId)
      .single()
    const { data: srcEnquiry } = await supabase
      .from('enquiries')
      .select('enquiry_ref')
      .eq('converted_job_id', jobId)
      .maybeSingle()
    const { data: paidRows, error: paidErr } = await supabase
      .from('payments')
      .select('amount_pence')
      .or(
        srcEnquiry
          ? `job_id.eq.${jobId},enquiry_ref.eq.${srcEnquiry.enquiry_ref}`
          : `job_id.eq.${jobId}`
      )
      .eq('status', 'paid')
    if (paidErr) throw paidErr
    const totalPaid = (paidRows || []).reduce(
      (s, p) => s + (p.amount_pence || 0),
      0
    )
    if (job && totalPaid >= Math.round((job.price_total ?? 0) * 100)) {
      await supabase
        .from('jobs')
        .update({ payment_received: true, updated_at: now })
        .eq('id', jobId)
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Repair paid in full via Stripe (£${(totalPaid / 100).toFixed(2)})`,
      })
    }
  }

  if (ranTransition && kind === 'enquiry_deposit' && enquiryRef) {
    await supabase
      .from('enquiries')
      .update({ deposit_received: true, deposit_received_at: now })
      .eq('enquiry_ref', enquiryRef)
  }

  if (ranTransition && kind === 'enquiry_payment' && enquiryRef) {
    await supabase
      .from('enquiries')
      .update({ payment_received: true })
      .eq('enquiry_ref', enquiryRef)
  }

  if (ranTransition && kind === 'fund_topup' && fundId) {
    const { data: fund } = await supabase
      .from('repair_funds')
      .select('balance_pence, target_amount_pence')
      .eq('id', fundId)
      .single()
    if (fund) {
      const newBalance = fund.balance_pence + amountPence
      const funded = newBalance >= fund.target_amount_pence
      await supabase
        .from('repair_funds')
        .update({
          balance_pence: newBalance,
          status: funded ? 'funded' : 'open',
          funded_at: funded ? now : null,
          updated_at: now,
        })
        .eq('id', fundId)
      if (funded) await sendFundedSms(supabase, fundId)
    }
  }
}

/** Confirmation text when a job deposit lands. */
async function sendDepositReceivedSms(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  amountPence: number
) {
  if (!isSmsConfigured()) return
  try {
    const { data: job } = await supabase
      .from('jobs')
      .select('customer_name, customer_phone, device_make, device_model')
      .eq('id', jobId)
      .single()
    if (!job?.customer_phone || !String(job.customer_phone).trim()) return

    const firstName = getFirstName(job.customer_name)
    const amount = (amountPence / 100).toFixed(2)
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'DEPOSIT_RECEIVED')
      .eq('is_active', true)
      .single()

    const message = template
      ? renderSmsTemplate(template.body, {
          first_name: firstName,
          deposit_amount: amount,
          device_summary: safeDeviceLabel(job.device_make, job.device_model),
        })
      : `Hi ${firstName}! Your £${amount} deposit is paid — we're ordering your part now and will text you when it lands.\n\nNFD Repairs`

    await sendSms(job.customer_phone, message)
  } catch (err) {
    console.error('[Stripe webhook] Deposit SMS failed:', err)
  }
}

/** Heads-up text when a repair fund reaches its target. */
async function sendFundedSms(
  supabase: ReturnType<typeof createServiceClient>,
  fundId: string
) {
  if (!isSmsConfigured()) return
  try {
    const { data: fund } = await supabase
      .from('repair_funds')
      .select('customer_name, customer_phone, device_summary, target_amount_pence')
      .eq('id', fundId)
      .single()
    if (!fund?.customer_phone || !String(fund.customer_phone).trim()) return

    const firstName = getFirstName(fund.customer_name)
    const target = (fund.target_amount_pence / 100).toFixed(0)
    await sendSms(
      fund.customer_phone,
      `Hi ${firstName}! You've saved the full £${target} for your ${fund.device_summary || 'device'} repair — nice one!\n\nPop in or reply to this text and we'll get it booked in.\n\nNFD Repairs`
    )
  } catch (err) {
    console.error('[Stripe webhook] Funded SMS failed:', err)
  }
}
