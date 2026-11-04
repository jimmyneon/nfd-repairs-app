import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

/**
 * GET /api/jobs/[jobId]/payments
 *
 * Payment ledger for a job — who paid, what for, when and its status.
 * The payments table is service-role only, so the staff job page reads it
 * through here. Includes payments taken against the source enquiry before
 * it was converted (deposits are commonly paid at enquiry stage).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()
  const jobId = params.jobId

  const { data: srcEnquiry } = await supabase
    .from('enquiries')
    .select('enquiry_ref')
    .eq('converted_job_id', jobId)
    .maybeSingle()

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, kind, status, amount_pence, currency, description, customer_email, paid_at, created_at')
    .or(
      srcEnquiry
        ? `job_id.eq.${jobId},enquiry_ref.eq.${srcEnquiry.enquiry_ref}`
        : `job_id.eq.${jobId}`
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[job payments] query failed:', error)
    return NextResponse.json({ error: 'Could not load payments' }, { status: 500 })
  }

  return NextResponse.json({ payments: payments || [] })
}
