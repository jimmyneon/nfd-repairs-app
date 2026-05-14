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

    // Update job status to QUOTE_REJECTED
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'QUOTE_REJECTED',
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
