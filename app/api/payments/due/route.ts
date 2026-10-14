import { jobPaymentState } from '@/lib/job-payment-state'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * GET /api/payments/due?token=<tracking-or-short-token>
 *
 * Backs the customer-facing /pay page: given a job's tracking token,
 * return what's still owed (deposit first, then balance) without
 * exposing any more customer detail than needed.
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'payments-due', 30)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const token = request.nextUrl.searchParams.get('token')?.trim() || ''
  if (!/^[\w-]{4,80}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400, headers })
  }

  const supabase = createServiceClient()
  const { data: job } = await supabase
    .from('jobs')
    .select(
      'id, job_ref, status, device_make, device_model, price_total, deposit_required, deposit_amount, deposit_received, payment_received'
    )
    .or(`tracking_token.eq.${token},short_token.eq.${token}`)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Repair not found' }, { status: 404, headers })
  }

  // Payments tied to the job itself plus any made earlier against the
  // enquiry it was converted from (payday deposits, fund redemptions).
  const { data: srcEnquiry, error: enquiryReadError } = await supabase
    .from('enquiries')
    .select('enquiry_ref')
    .eq('converted_job_id', job.id)
    .maybeSingle()

  if (enquiryReadError) return NextResponse.json({ error: 'Could not load payment history' }, { status: 500, headers })
  const { data: paidRows, error: paidErr } = await supabase
    .from('payments')
    .select('amount_pence, kind')
    .or(
      srcEnquiry
        ? `job_id.eq.${job.id},enquiry_ref.eq.${srcEnquiry.enquiry_ref}`
        : `job_id.eq.${job.id}`
    )
    .eq('status', 'paid')
  if (paidErr) {
    console.error('[Payments] due paid lookup failed:', paidErr)
    return NextResponse.json(
      { error: 'Could not load payment status' },
      { status: 500, headers }
    )
  }
  const state = jobPaymentState(job, paidRows || [])

  return NextResponse.json(
    {
      job_ref: job.job_ref,
      device: [job.device_make, job.device_model].filter(Boolean).join(' ') || null,
      status: job.status,
      total_pence: state.total,
      paid_pence: state.paid,
      deposit_due_pence: state.depositDue,
      balance_due_pence: state.balance,
      fully_paid: state.fullyPaid,
      can_pay: state.canPay,
      payment_message: !state.canPay ? job.status === 'CANCELLED' ? 'This repair is cancelled. Contact us if you need help.' : 'We will confirm the repair price before taking payment.' : null,
      currency: 'gbp',
    },
    { headers }
  )
}

