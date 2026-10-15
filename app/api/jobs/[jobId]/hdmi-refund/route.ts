import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

// Refund endpoint for HDMI-site (ps5hdmirepair.co.uk) bookings.
// Proxies to the hdmi-refund edge function; recording + customer email
// happen via the signed Stripe charge.refunded webhook.
const HDMI_FUNCTIONS_BASE =
  process.env.HDMI_FUNCTIONS_BASE ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()
  const { data: booking, error } = await supabase
    .from('hdmi_bookings')
    .select('id,reference,model,shipping,return_service,name,phone,email,address,town,postcode,total_pence,paid_pence,cancelled_at,dispatched_at,testing_completed_at,carrier,carrier_tracking,carrier_url,inbound_label,inbound_slug,inbound_service_name,return_service_name,early_start,created_at')
    .eq('job_id', params.jobId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'No HDMI booking for this job' }, { status: 404 })

  const [{ data: payments }, { data: job }, { data: shipments }] = await Promise.all([
    supabase
      .from('hdmi_payments')
      .select('kind,amount_pence,refunded_pence')
      .eq('booking_id', booking.id),
    supabase
      .from('jobs')
      .select('tracking_token')
      .eq('id', params.jobId)
      .maybeSingle(),
    supabase
      .from('hdmi_shipments')
      .select('direction,courier,service_name,status,tracking_number,tracking_url,label_ref,label_url,collection_date,compensation_pence,upgrade_pence,cost_pence,error')
      .eq('booking_id', booking.id),
  ])

  const refundable = (payments || []).reduce(
    (sum, p) => sum + (p.amount_pence - (p.refunded_pence || 0)),
    0
  )

  return NextResponse.json({
    reference: booking.reference,
    model: booking.model,
    shipping: booking.shipping,
    return_service: booking.return_service,
    inbound_service_name: booking.inbound_slug === 'self' ? 'Customer posts it themselves' : booking.inbound_service_name,
    return_service_name: booking.return_service_name,
    early_start: booking.early_start,
    cancellation_ends: new Date(new Date(booking.created_at).getTime() + 14 * 86400000).toISOString(),
    name: booking.name,
    phone: booking.phone,
    email: booking.email,
    address: booking.address,
    town: booking.town,
    postcode: booking.postcode,
    total_pence: booking.total_pence,
    paid_pence: booking.paid_pence,
    refundable_pence: refundable,
    cancelled: !!booking.cancelled_at,
    dispatched_at: booking.dispatched_at,
    testing_completed_at: booking.testing_completed_at,
    carrier: booking.carrier,
    carrier_tracking: booking.carrier_tracking,
    carrier_url: booking.carrier_url,
    label_sent: !!booking.inbound_label,
    tracking_url: job?.tracking_token
      ? `https://ps5hdmirepair.co.uk/track/${job.tracking_token}`
      : null,
    shipments: shipments || [],
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const secret = process.env.HDMI_STAFF_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'HDMI refund not configured' }, { status: 503 })
  }

  const supabase = createServiceClient()
  const { data: booking, error } = await supabase
    .from('hdmi_bookings')
    .select('id,reference,cancelled_at')
    .eq('job_id', params.jobId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'No HDMI booking for this job' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const amountPence =
    typeof body.amount_pence === 'number' && body.amount_pence > 0
      ? Math.round(body.amount_pence)
      : undefined

  const result = await fetch(`${HDMI_FUNCTIONS_BASE}/hdmi-refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId: booking.id, amountPence }),
  })
  const payload = await result.json().catch(() => ({}))
  return NextResponse.json(payload, { status: result.status })
}
