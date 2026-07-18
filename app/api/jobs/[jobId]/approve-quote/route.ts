import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  { params }: { params: { jobId: string } }
) {
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

    // Update job status to QUOTE_APPROVED
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'QUOTE_APPROVED',
        status_changed_at: new Date().toISOString(),
        quote_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
    }

    // Create synthetic event for quote approval
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'QUOTE_APPROVED',
        event_data: {
          quoted_price: job.quoted_price || job.price_total,
          approved_by: 'customer',
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create quote approval event:', eventError)
    }

    // Create notification for staff
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        type: 'QUOTE_APPROVED',
        title: 'Quote Approved',
        body: `${job.job_ref}: ${job.device_make} ${job.device_model} - Customer approved the quote (£${job.quoted_price || job.price_total})`,
        job_id: jobId,
      })

    if (notifError) {
      console.error('Failed to create notification:', notifError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error approving quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
