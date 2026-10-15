import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

// Dispatch endpoint for HDMI-site postal bookings. Proxies to the
// hdmi-dispatch edge function, which books the return courier (or records
// manual tracking) and emails the customer. The database refuses dispatch
// until testing is done and the balance is cleared.
const HDMI_FUNCTIONS_BASE =
  process.env.HDMI_FUNCTIONS_BASE ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const secret = process.env.HDMI_STAFF_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'HDMI dispatch not configured' }, { status: 503 })
  }

  const supabase = createServiceClient()
  const { data: booking, error } = await supabase
    .from('hdmi_bookings')
    .select('id,reference')
    .eq('job_id', params.jobId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'No HDMI booking for this job' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const manual =
    typeof body.carrier === 'string' && typeof body.tracking === 'string' && typeof body.url === 'string'
      ? { carrier: body.carrier.trim(), tracking: body.tracking.trim(), url: body.url.trim() }
      : {}
  // Optional courier collection day for the return leg (YYYY-MM-DD).
  const collectionDate =
    typeof body.collectionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.collectionDate)
      ? { collectionDate: body.collectionDate }
      : {}

  const result = await fetch(`${HDMI_FUNCTIONS_BASE}/hdmi-dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: booking.id, ...manual, ...collectionDate }),
  })
  const payload = await result.json().catch(() => ({}))
  return NextResponse.json(payload, { status: result.status })
}
