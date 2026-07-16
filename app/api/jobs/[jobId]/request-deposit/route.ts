import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

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
        status_changed_at: new Date().toISOString(),
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

    // Send SMS using DEPOSIT_REQUEST template from database
    try {
      const firstName = getFirstName(job.customer_name)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
      const trackingUrl = `${appUrl}/t/${job.tracking_token}`
      const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'
      const depositAmount = (job.deposit_amount || 20.00).toFixed(2)

      // Fetch template from database
      const { data: template } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'DEPOSIT_REQUEST')
        .eq('is_active', true)
        .single()

      let smsMessage: string
      if (template) {
        smsMessage = renderSmsTemplate(template.body, {
          first_name: firstName,
          customer_name: job.customer_name || '',
          device_make: job.device_make || '',
          device_model: job.device_model || '',
          deposit_amount: depositAmount,
          deposit_link: depositUrl,
          tracking_link: trackingUrl,
          job_ref: job.job_ref,
        })
      } else {
        // Fallback if template not in database
        smsMessage = `Hi ${firstName}, we need to order parts for your ${job.device_model || 'device'}. To pay the £${depositAmount} deposit and get that started, please use this link below.\n\n${depositUrl}\n\nIf you would like to check what's happening with it, please use this link below.\n\n${trackingUrl}\n\nMany thanks,\nNew Forest Device Repairs`
      }

      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: job.customer_phone,
            message: smsMessage,
          }),
        })
      } else {
        console.error('MACRODROID_WEBHOOK_URL not configured')
      }

      // Log the SMS
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: 'Deposit request SMS sent to customer',
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
