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
      'id, job_ref, status, device_summary, price_total, deposit_required, deposit_amount, deposit_received, payment_received'
    )
    .or(`tracking_token.eq.${token},short_token.eq.${token}`)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Repair not found' }, { status: 404, headers })
  }

  const { data: paidRows, error: paidErr } = await supabase
    .from('payments')
    .select('amount_pence')
    .eq('job_id', job.id)
    .eq('status', 'paid')
  if (paidErr) {
    console.error('[Payments] due paid lookup failed:', paidErr)
    return NextResponse.json(
      { error: 'Could not load payment status' },
      { status: 500, headers }
    )
  }
  const paidPence = (paidRows || []).reduce(
    (sum, p) => sum + (p.amount_pence || 0),
    0
  )
  const totalPence = Math.round((job.price_total ?? 0) * 100)

  const depositDuePence =
    !job.deposit_received && job.deposit_required
      ? Math.round((job.deposit_amount ?? 20) * 100)
      : 0
  const balanceDuePence = job.payment_received
    ? 0
    : Math.max(totalPence - paidPence, 0)

  return NextResponse.json(
    {
      job_ref: job.job_ref,
      device: job.device_summary,
      status: job.status,
      total_pence: totalPence,
      paid_pence: paidPence,
      deposit_due_pence: depositDuePence,
      balance_due_pence: balanceDuePence,
      fully_paid: job.payment_received || balanceDuePence === 0,
      currency: 'gbp',
    },
    { headers }
  )
}
