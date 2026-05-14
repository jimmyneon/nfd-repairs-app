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
    const { quoted_price, requires_parts_order } = await request.json()

    if (!quoted_price || quoted_price <= 0) {
      return NextResponse.json({ error: 'Invalid quote price' }, { status: 400 })
    }

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Update job with quote price and parts requirement
    const updateData: any = {
      quoted_price,
      requires_parts_order: requires_parts_order || false,
      updated_at: new Date().toISOString(),
    }

    // Set deposit amount if parts are required
    if (requires_parts_order) {
      updateData.deposit_amount = 20.00
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    // Create synthetic event for quote sent
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'QUOTE_SENT',
        event_data: {
          quoted_price,
          requires_parts_order: requires_parts_order || false,
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create quote sent event:', eventError)
    }

    // Send SMS with quote approval link
    const quoteApprovalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/quote/approve?jobId=${jobId}`
    
    const smsMessage = `Your repair quote for ${job.device_make} ${job.device_model} is ready: £${quoted_price.toFixed(2)}. ${requires_parts_order ? '(Parts required - £20 deposit)' : ''} Approve: ${quoteApprovalUrl}`

    try {
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
      console.error('Failed to send SMS:', smsError)
      // Don't fail the request if SMS fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
