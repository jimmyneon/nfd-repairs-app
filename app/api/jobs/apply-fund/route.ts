import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/apply-fund   (staff only)
 *
 * { job_id, fund_token? }
 * Applies a repair-fund balance to a job: creates a 'fund_redemption'
 * payment, marks the fund redeemed, and flips jobs.payment_received when
 * the running total covers the price. With no fund_token it looks the
 * fund up from the job's source enquiry, then by customer phone.
 */
export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const body = await request.json().catch(() => null)
  const jobId = String(body?.job_id || '').trim()
  const fundToken = String(body?.fund_token || '').trim()
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_ref, price_total, customer_phone')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Locate the fund: explicit token → source enquiry → customer phone.
  let fund: any = null
  if (fundToken) {
    const { data } = await supabase
      .from('repair_funds')
      .select('id, enquiry_ref, balance_pence, status')
      .eq('fund_token', fundToken)
      .maybeSingle()
    fund = data
  }
  if (!fund) {
    const { data: enquiry } = await supabase
      .from('enquiries')
      .select('enquiry_ref')
      .eq('converted_job_id', jobId)
      .maybeSingle()
    if (enquiry) {
      const { data } = await supabase
        .from('repair_funds')
        .select('id, enquiry_ref, balance_pence, status')
        .eq('enquiry_ref', enquiry.enquiry_ref)
        .in('status', ['funded', 'open'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      fund = data
    }
  }
  if (!fund && job.customer_phone) {
    const { data } = await supabase
      .from('repair_funds')
      .select('id, enquiry_ref, balance_pence, status')
      .eq('customer_phone', job.customer_phone)
      .in('status', ['funded', 'open'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    fund = data
  }

  if (!fund) {
    return NextResponse.json({ error: 'No repair fund found for this job' }, { status: 404 })
  }
  if (fund.status === 'redeemed' || fund.balance_pence <= 0) {
    return NextResponse.json({ error: 'Fund already spent or empty' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Atomic claim so two staff clicks can't double-apply.
  const { data: claimed } = await supabase
    .from('repair_funds')
    .update({ status: 'redeemed', redeemed_at: now, updated_at: now })
    .eq('id', fund.id)
    .in('status', ['funded', 'open'])
    .select('id')
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Fund already spent' }, { status: 409 })
  }

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      kind: 'fund_redemption',
      job_id: job.id,
      enquiry_ref: fund.enquiry_ref || null,
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
    await supabase
      .from('repair_funds')
      .update({ status: 'funded', redeemed_at: null, updated_at: now })
      .eq('id', fund.id)
    console.error('[ApplyFund] Payment insert failed:', payErr)
    return NextResponse.json({ error: 'Could not apply fund' }, { status: 500 })
  }

  await supabase
    .from('repair_funds')
    .update({ redeemed_payment_id: payment.id })
    .eq('id', fund.id)

  await supabase.from('job_events').insert({
    job_id: job.id,
    type: 'SYSTEM',
    message: `Repair fund applied — £${(fund.balance_pence / 100).toFixed(2)}`,
  })

  // Payments the customer made against the source enquiry (e.g. a
  // self-serve fund redemption before the job existed) count toward
  // this job too — link them over so the total is right.
  if (fund.enquiry_ref) {
    await supabase
      .from('payments')
      .update({ job_id: job.id, updated_at: now })
      .eq('enquiry_ref', fund.enquiry_ref)
      .is('job_id', null)
      .eq('status', 'paid')
  }

  const { data: paidRows, error: paidErr } = await supabase
    .from('payments')
    .select('amount_pence')
    .eq('job_id', job.id)
    .eq('status', 'paid')
  if (paidErr) {
    console.error('[ApplyFund] Paid-sum check failed:', paidErr)
    return NextResponse.json({ ok: true, applied_pence: fund.balance_pence, warning: 'paid-check failed' })
  }
  const totalPaid = (paidRows || []).reduce((s, p) => s + (p.amount_pence || 0), 0)
  if (job.price_total && totalPaid >= Math.round(job.price_total * 100)) {
    await supabase
      .from('jobs')
      .update({ payment_received: true, updated_at: now })
      .eq('id', job.id)
    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: 'Repair paid in full',
    })
  }

  return NextResponse.json({
    ok: true,
    applied_pence: fund.balance_pence,
    total_paid_pence: totalPaid,
  })
}
