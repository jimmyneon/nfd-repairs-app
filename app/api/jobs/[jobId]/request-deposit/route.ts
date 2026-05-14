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

    // Update job status to AWAITING_DEPOSIT
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'AWAITING_DEPOSIT',
        deposit_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to request deposit' }, { status: 500 })
    }

    // Create synthetic event for deposit request
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'DEPOSIT_REQUESTED',
        event_data: {
          deposit_amount: job.deposit_amount || 20.00,
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create deposit request event:', eventError)
    }

    // Send SMS about deposit request
    try {
      const smsMessage = `Your £${job.deposit_amount || 20.00} deposit is required for parts. Please visit our shop to pay. Ref: ${job.job_ref}`
      
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: job.customer_phone,
          message: smsMessage,
          job_id: jobId,
        }),
      })
    } catch (smsError) {
      console.error('Failed to send deposit SMS:', smsError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error requesting deposit:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
