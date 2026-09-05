import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()

  try {
    const { jobId } = params

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Update job status to QUOTE_REJECTED
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'QUOTE_REJECTED',
        status_changed_at: new Date().toISOString(),
        quote_rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to reject quote' }, { status: 500 })
    }

    // Create synthetic event for quote rejection
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'QUOTE_REJECTED',
        event_data: {
          quoted_price: job.quoted_price || job.price_total,
          rejected_by: 'customer',
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create quote rejection event:', eventError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error rejecting quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
