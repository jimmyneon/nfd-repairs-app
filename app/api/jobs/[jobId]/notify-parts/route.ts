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

    // Create synthetic event for parts notification
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'PARTS_NOTIFICATION_SENT',
        event_data: {
          requires_parts_order: job.requires_parts_order,
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create parts notification event:', eventError)
    }

    // Send SMS about parts
    try {
      const smsMessage = `Update on your repair (${job.job_ref}): Parts have been ordered for your ${job.device_make} ${job.device_model}. We'll notify you when they arrive.`
      
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
      console.error('Failed to send parts SMS:', smsError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending parts notification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
