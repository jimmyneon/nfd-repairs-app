import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { requireStaffUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const SITE_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://newforestdevicerepairs.co.uk'
).replace(/\/+$/, '')

/**
 * POST /api/jobs/send-payment-link { jobId }
 *
 * Staff tool: text the customer their per-job payment link. The /pay page
 * figures out whether a deposit or the balance is due and creates a
 * Stripe Checkout session (card, or Klarna where eligible) on tap.
 * Typical use: part confirmed available + turnaround agreed → send link.
 */
export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()

  try {
    const { jobId } = await request.json()
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.payment_received) {
      return NextResponse.json(
        { error: 'This repair is already paid in full' },
        { status: 409 }
      )
    }

    if (!String(job.customer_phone || '').trim()) {
      return NextResponse.json(
        { error: 'No phone number on this job' },
        { status: 400 }
      )
    }

    const payUrl = `${SITE_BASE}/pay/?t=${encodeURIComponent(
      job.short_token || job.tracking_token
    )}`

    // What are we asking them to pay? Deposit takes precedence.
    const { data: paidRows, error: paidErr } = await supabase
      .from('payments')
      .select('amount_pence')
      .eq('job_id', job.id)
      .eq('status', 'paid')
    if (paidErr) {
      return NextResponse.json(
        { error: 'Could not check payment history' },
        { status: 500 }
      )
    }
    const paidPence = (paidRows || []).reduce(
      (s, p) => s + (p.amount_pence || 0),
      0
    )
    const depositDue =
      job.deposit_required && !job.deposit_received
        ? Math.round((job.deposit_amount ?? 20) * 100)
        : 0
    const balanceDue = Math.max(
      Math.round((job.price_total ?? 0) * 100) - paidPence,
      0
    )
    const amountDuePence = depositDue || balanceDue

    if (amountDuePence <= 0) {
      return NextResponse.json(
        { error: 'Nothing left to pay on this job' },
        { status: 409 }
      )
    }

    const firstName = getFirstName(job.customer_name)
    const amountText = (amountDuePence / 100).toFixed(2)

    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'PAYMENT_LINK')
      .eq('is_active', true)
      .single()

    const message = template
      ? renderSmsTemplate(template.body, {
          first_name: firstName,
          customer_name: job.customer_name || '',
          device_summary: safeDeviceLabel(job.device_make, job.device_model),
          amount_due: amountText,
          payment_link: payUrl,
          job_ref: job.job_ref,
        })
      : `Hi ${firstName}! Here's the secure payment link for your ${safeDeviceLabel(
          job.device_make,
          job.device_model
        )} repair — £${amountText} due.\n\nPay by card or Klarna:\n${payUrl}\n\nNFD Repairs`

    if (!isSmsConfigured()) {
      return NextResponse.json({ error: 'SMS not configured' }, { status: 503 })
    }
    await sendSms(job.customer_phone, message)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: `Payment link sent (£${amountText} due)`,
    })

    return NextResponse.json({ success: true, pay_url: payUrl })
  } catch (error) {
    console.error('Error sending payment link:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
