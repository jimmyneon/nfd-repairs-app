import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import {
  createPaymentCheckout,
  findOpenPayment,
  PaymentKind,
} from '@/lib/payments'
import { getStripe } from '@/lib/stripe'
import { isQuoteActionTokenValid } from '@/lib/job-utils'

export const dynamic = 'force-dynamic'

const SITE_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://newforestdevicerepairs.co.uk'
).replace(/\/+$/, '')

const DEPOSIT_FALLBACK_PENCE = 2000 // £20 house deposit when none is set

const ALLOWED_RETURN_HOSTS = new Set([
  'newforestdevicerepairs.co.uk',
  'www.newforestdevicerepairs.co.uk',
  'nfdr.uk',
  'www.nfdr.uk',
  'nfd-repairs-app.vercel.app',
])

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/** Only allow success/cancel redirects back to our own properties. */
function safeReturnUrl(raw: unknown, request: NextRequest): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      const isLocalDev =
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.origin)
      if (!isLocalDev) return null
    }
    if (ALLOWED_RETURN_HOSTS.has(url.hostname)) return raw
    const appHost = process.env.NEXT_PUBLIC_APP_URL
    if (appHost && url.hostname === new URL(appHost).hostname) return raw
    return null
  } catch {
    return null
  }
}

/**
 * Append session params by string concat — Stripe needs the LITERAL text
 * "{CHECKOUT_SESSION_ID}" in success_url, and URLSearchParams would
 * percent-encode the braces.
 */
function withSessionParams(base: string): string {
  const clean = base.replace(/[?&](session_id|paid|cancelled)=[^&]*/g, '')
  const sep = clean.includes('?') ? '&' : '?'
  return `${clean}${sep}session_id={CHECKOUT_SESSION_ID}&paid=1`
}

function withCancelledParam(base: string): string {
  const clean = base.replace(/[?&](session_id|paid|cancelled)=[^&]*/g, '')
  const sep = clean.includes('?') ? '&' : '?'
  return `${clean}${sep}cancelled=1`
}

/**
 * POST /api/payments/checkout
 *
 * Creates a Stripe Checkout session for one of the public payment kinds.
 * Amounts are ALWAYS computed server-side from the job/enquiry/fund —
 * the client never dictates price.
 *
 *   { kind: 'job_deposit'|'job_payment', token }        — job by tracking token
 *   { kind: 'enquiry_deposit'|'enquiry_payment', enquiry_ref, t }
 *   { kind: 'fund_topup', fund_token, amount }          — amount in £, £5–£500
 *   optional return_url — page to come back to after paying
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'payments-checkout', 20)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers }
    )
  }

  if (!getStripe()) {
    return NextResponse.json(
      { error: 'Payments are not configured' },
      { status: 503, headers }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
  }

  const kind = body.kind as PaymentKind
  const supabase = createServiceClient()
  const returnUrl = safeReturnUrl(body.return_url, request)

  const urls = () => ({
    successUrl: returnUrl
      ? withSessionParams(returnUrl)
      : `${SITE_BASE}/pay/thanks/?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: returnUrl
      ? withCancelledParam(returnUrl)
      : `${SITE_BASE}/pay/thanks/?cancelled=1`,
  })

  try {
    // ---- Job payments (deposit or balance), found by tracking token ----
    if (kind === 'job_deposit' || kind === 'job_payment') {
      const token = String(body.token || '').trim()
      if (!/^[\w-]{4,80}$/.test(token)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 400, headers })
      }

      const { data: job } = await supabase
        .from('jobs')
        .select(
          'id, job_ref, status, device_summary, price_total, deposit_required, deposit_amount, deposit_received, payment_received, customer_name, customer_phone, customer_email'
        )
        .or(`tracking_token.eq.${token},short_token.eq.${token}`)
        .single()

      if (!job) {
        return NextResponse.json({ error: 'Repair not found' }, { status: 404, headers })
      }

      // Sum what's already been paid through Stripe — for this job and
      // the enquiry it was converted from. A failed read must not
      // silently undercharge.
      const { data: srcEnquiry } = await supabase
        .from('enquiries')
        .select('enquiry_ref')
        .eq('converted_job_id', job.id)
        .maybeSingle()
      const { data: paidRows, error: paidErr } = await supabase
        .from('payments')
        .select('amount_pence')
        .or(
          srcEnquiry
            ? `job_id.eq.${job.id},enquiry_ref.eq.${srcEnquiry.enquiry_ref}`
            : `job_id.eq.${job.id}`
        )
        .eq('status', 'paid')
      if (paidErr) {
        throw new Error('Could not check payment history')
      }
      const alreadyPaidPence = (paidRows || []).reduce(
        (sum, p) => sum + (p.amount_pence || 0),
        0
      )

      let amountPence: number
      let description: string
      if (kind === 'job_deposit') {
        if (job.deposit_received) {
          return NextResponse.json(
            { error: 'Deposit already paid', already_paid: true },
            { status: 409, headers }
          )
        }
        amountPence = Math.round((job.deposit_amount ?? 20) * 100)
        description = `Repair deposit — ${job.device_summary} (${job.job_ref})`
      } else {
        if (job.payment_received) {
          return NextResponse.json(
            { error: 'Already paid in full', already_paid: true },
            { status: 409, headers }
          )
        }
        const totalPence = Math.round((job.price_total ?? 0) * 100)
        amountPence = totalPence - alreadyPaidPence
        if (amountPence <= 0) {
          return NextResponse.json(
            { error: 'Nothing left to pay', already_paid: true },
            { status: 409, headers }
          )
        }
        description = `Repair balance — ${job.device_summary} (${job.job_ref})`
      }

      const existing = await findOpenPayment(supabase, { jobId: job.id }, kind)
      if (existing) {
        return NextResponse.json({ url: existing.url, reused: true }, { headers })
      }

      const { successUrl, cancelUrl } = urls()
      const created = await createPaymentCheckout(supabase, {
        kind,
        amountPence,
        description,
        jobId: job.id,
        customerName: job.customer_name,
        customerPhone: job.customer_phone,
        customerEmail: job.customer_email,
        successUrl,
        cancelUrl,
        metadata: { job_ref: job.job_ref },
      })
      return NextResponse.json({ url: created.url }, { headers })
    }

    // ---- Enquiry payments (quote-accept / payday deposits, pay-in-full) ----
    if (kind === 'enquiry_deposit' || kind === 'enquiry_payment') {
      const ref = String(body.enquiry_ref || '').trim().toUpperCase()
      if (!ref) {
        return NextResponse.json({ error: 'Missing enquiry_ref' }, { status: 400, headers })
      }

      const { data: enquiry } = await supabase
        .from('enquiries')
        .select(
          'enquiry_ref, customer_name, customer_email, customer_phone, quoted_price, display_price, device_make, device_model, repair_type, deposit_required, deposit_amount, deposit_received, payment_received, status, quote_action_token, quote_action_token_expires_at, quote_action_token_revoked_at'
        )
        .eq('enquiry_ref', ref)
        .single()

      if (!enquiry) {
        return NextResponse.json({ error: 'Enquiry not found' }, { status: 404, headers })
      }

      // Enquiry refs are enumerable — the secure quote token is required so a
      // guess can't start a checkout or reveal the quoted amount.
      const token = String(body.t || '')
      if (!enquiry.quote_action_token ||
          !isQuoteActionTokenValid(
            token,
            enquiry.quote_action_token_expires_at,
            enquiry.quote_action_token_revoked_at
          ) ||
          token !== enquiry.quote_action_token) {
        return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403, headers })
      }

      const deviceLabel =
        [enquiry.device_make, enquiry.device_model].filter(Boolean).join(' ') ||
        'device'
      const repairLabel = enquiry.repair_type || 'repair'

      let amountPence: number
      let description: string
      if (kind === 'enquiry_deposit') {
        if (enquiry.deposit_received || enquiry.payment_received) {
          return NextResponse.json(
            { error: 'Deposit already paid', already_paid: true },
            { status: 409, headers }
          )
        }
        amountPence = enquiry.deposit_amount
          ? Math.round(enquiry.deposit_amount * 100)
          : DEPOSIT_FALLBACK_PENCE
        description = `Repair deposit — ${deviceLabel} ${repairLabel}`
      } else {
        if (enquiry.payment_received) {
          return NextResponse.json(
            { error: 'Already paid in full', already_paid: true },
            { status: 409, headers }
          )
        }
        if (!enquiry.quoted_price || enquiry.quoted_price <= 0) {
          return NextResponse.json(
            { error: 'This quote has no confirmed price yet — we\'ll confirm before taking payment.' },
            { status: 400, headers }
          )
        }
        const { data: paidRows, error: paidErr } = await supabase
          .from('payments')
          .select('amount_pence')
          .eq('enquiry_ref', ref)
          .eq('status', 'paid')
        if (paidErr) {
          throw new Error('Could not check payment history')
        }
        const alreadyPaidPence = (paidRows || []).reduce(
          (sum, p) => sum + (p.amount_pence || 0),
          0
        )
        amountPence = Math.round(enquiry.quoted_price * 100) - alreadyPaidPence
        if (amountPence <= 0) {
          return NextResponse.json(
            { error: 'Nothing left to pay', already_paid: true },
            { status: 409, headers }
          )
        }
        description = `Repair payment — ${deviceLabel} ${repairLabel}`
      }

      const existing = await findOpenPayment(supabase, { enquiryRef: ref }, kind)
      if (existing) {
        return NextResponse.json({ url: existing.url, reused: true }, { headers })
      }

      const { successUrl, cancelUrl } = urls()
      const created = await createPaymentCheckout(supabase, {
        kind,
        amountPence,
        description,
        enquiryRef: ref,
        customerName: enquiry.customer_name,
        customerPhone: enquiry.customer_phone,
        customerEmail: enquiry.customer_email,
        successUrl,
        cancelUrl,
      })
      return NextResponse.json({ url: created.url }, { headers })
    }

    // ---- Repair fund top-ups (customer-chosen amount within bounds) ----
    if (kind === 'fund_topup') {
      const fundToken = String(body.fund_token || '').trim()
      const amountPounds = Number(body.amount)
      if (!/^[\w-]{4,80}$/.test(fundToken)) {
        return NextResponse.json({ error: 'Invalid fund token' }, { status: 400, headers })
      }
      if (!Number.isFinite(amountPounds) || amountPounds < 5 || amountPounds > 500) {
        return NextResponse.json(
          { error: 'Top-up must be between £5 and £500' },
          { status: 400, headers }
        )
      }

      const { data: fund } = await supabase
        .from('repair_funds')
        .select('id, customer_name, customer_phone, customer_email, device_summary, repair_summary, target_amount_pence, balance_pence, status')
        .eq('fund_token', fundToken)
        .single()

      if (!fund || fund.status !== 'open') {
        return NextResponse.json(
          { error: 'Repair fund not found or no longer open' },
          { status: 404, headers }
        )
      }

      const remaining = fund.target_amount_pence - fund.balance_pence
      if (remaining <= 0) {
        return NextResponse.json(
          { error: 'This fund is already fully saved up', already_paid: true },
          { status: 409, headers }
        )
      }
      // Cap the top-up at what's still needed — no overpaying the pot
      const amountPence = Math.min(Math.round(amountPounds * 100), remaining)

      const { successUrl, cancelUrl } = urls()
      const created = await createPaymentCheckout(supabase, {
        kind,
        amountPence,
        description: `Repair fund top-up — ${fund.device_summary || 'repair'}`,
        repairFundId: fund.id,
        customerName: fund.customer_name,
        customerPhone: fund.customer_phone,
        customerEmail: fund.customer_email,
        successUrl,
        cancelUrl,
        metadata: { fund_token: fundToken },
      })
      return NextResponse.json(
        { url: created.url, amount_pence: amountPence },
        { headers }
      )
    }

    return NextResponse.json({ error: 'Unknown payment kind' }, { status: 400, headers })
  } catch (error: any) {
    console.error('[Payments] Checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500, headers }
    )
  }
}
