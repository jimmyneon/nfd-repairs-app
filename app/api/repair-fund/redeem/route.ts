import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * POST /api/repair-fund/redeem
 *
 * Customer self-serve: a funded pot linked to a quote is converted into a
 * 'fund_redemption' payment against that enquiry. Subsequent balance
 * checkouts subtract it automatically (amounts are net of paid payments).
 * The money itself never moves — it arrived via Stripe top-ups; this is
 * the bookkeeping step that spends it.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'repair-fund-redeem', 5)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const body = await request.json().catch(() => null)
  const token = String(body?.token || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400, headers })
  }

  const supabase = createServiceClient()
  const { data: fund } = await supabase
    .from('repair_funds')
    .select('id, enquiry_ref, balance_pence, target_amount_pence, status')
    .eq('fund_token', token)
    .maybeSingle()

  if (!fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404, headers })
  }
  if (fund.status === 'redeemed') {
    return NextResponse.json({ ok: true, already_redeemed: true }, { headers })
  }
  if (fund.status !== 'funded' || fund.balance_pence <= 0) {
    return NextResponse.json(
      { error: 'Fund is not fully saved yet — keep topping up first.' },
      { status: 400, headers }
    )
  }
  if (!fund.enquiry_ref) {
    return NextResponse.json(
      { error: 'This fund is not linked to a quote — pop in or text us and we will apply it for you.' },
      { status: 400, headers }
    )
  }

  const now = new Date().toISOString()

  // Atomic claim: only flip funded→redeemed once. If another request beat
  // us to it, report the already-redeemed state rather than double-spend.
  const { data: claimed } = await supabase
    .from('repair_funds')
    .update({ status: 'redeemed', redeemed_at: now, updated_at: now })
    .eq('id', fund.id)
    .eq('status', 'funded')
    .select('id')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, already_redeemed: true }, { headers })
  }

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      kind: 'fund_redemption',
      enquiry_ref: fund.enquiry_ref,
      repair_fund_id: fund.id,
      amount_pence: fund.balance_pence,
      currency: 'gbp',
      status: 'paid',
      paid_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (payErr) {
    // Roll the claim back so the fund isn't stuck redeemed without a row.
    await supabase
      .from('repair_funds')
      .update({ status: 'funded', redeemed_at: null, updated_at: now })
      .eq('id', fund.id)
    console.error('[RepairFund] Redemption payment insert failed:', payErr)
    return NextResponse.json({ error: 'Could not apply fund' }, { status: 500, headers })
  }

  await supabase
    .from('repair_funds')
    .update({ redeemed_payment_id: payment.id })
    .eq('id', fund.id)

  // If the redemption covers the quote, flag the enquiry as paid.
  const { data: enquiry } = await supabase
    .from('enquiries')
    .select('quoted_price')
    .eq('enquiry_ref', fund.enquiry_ref)
    .maybeSingle()
  const { data: paidRows } = await supabase
    .from('payments')
    .select('amount_pence')
    .eq('enquiry_ref', fund.enquiry_ref)
    .eq('status', 'paid')
  const totalPaid = (paidRows || []).reduce((s, p) => s + (p.amount_pence || 0), 0)
  if (
    enquiry?.quoted_price &&
    totalPaid >= Math.round(enquiry.quoted_price * 100)
  ) {
    await supabase
      .from('enquiries')
      .update({ payment_received: true })
      .eq('enquiry_ref', fund.enquiry_ref)
  }

  return NextResponse.json(
    { ok: true, applied_pence: fund.balance_pence, enquiry_ref: fund.enquiry_ref },
    { headers }
  )
}
