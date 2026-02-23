import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { jobId, status } = await request.json()

    if (!jobId || !status) {
      return NextResponse.json(
        { error: 'Missing jobId or status' },
        { status: 400 }
      )
    }

    // Use service role key for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Check notification config to see if SMS should be sent for this status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, is_active')
      .eq('status_key', status)
      .single()

    if (config && (!config.send_sms || !config.is_active)) {
      console.log(`SMS disabled for status: ${status}`)
      
      // Special handling for COLLECTED status - schedule post-collection SMS
      if (status === 'COLLECTED') {
        try {
          const appUrl = 'https://nfd-repairs-app.vercel.app'
          await fetch(`${appUrl}/api/jobs/schedule-collection-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
          })
          console.log('Post-collection SMS scheduled for job:', job.job_ref)
        } catch (error) {
          console.error('Failed to schedule post-collection SMS:', error)
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'SMS disabled for this status' 
      })
    }

    // Only send SMS for key status changes
    const smsStatuses = ['AWAITING_DEPOSIT', 'PARTS_ORDERED', 'READY_TO_BOOK_IN', 'IN_REPAIR', 'READY_TO_COLLECT', 'COMPLETED', 'CANCELLED']
    
    if (!smsStatuses.includes(status)) {
      console.log(`Status ${status} does not trigger SMS notification`)
      return NextResponse.json({ success: true, message: 'Status does not trigger SMS' })
    }

    // Map status to template key (AWAITING_DEPOSIT uses DEPOSIT_REQUIRED template)
    const templateKey = status === 'AWAITING_DEPOSIT' ? 'DEPOSIT_REQUIRED' : status

    // Get SMS template for this status
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', templateKey)
      .eq('is_active', true)
      .single()

    if (!template) {
      console.log(`No active SMS template found for status: ${status}`)
      return NextResponse.json({ success: true, message: 'No template for this status' })
    }

    // Build tracking URL (use hardcoded URL since NEXT_PUBLIC_ vars not available in API routes)
    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const trackingUrl = `${appUrl}/t/${job.tracking_token}`
    const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'

    // Replace template variables
    let smsBody = template.body
      .replace('{customer_name}', job.customer_name)
      .replace('{device_make}', job.device_make)
      .replace('{device_model}', job.device_model)
      .replace('{price_total}', job.price_total?.toString() || '0')
      .replace('{tracking_link}', trackingUrl)
      .replace('{job_ref}', job.job_ref)
    
    // Add deposit-specific replacements if needed
    if (job.deposit_required) {
      smsBody = smsBody
        .replace('{deposit_amount}', job.deposit_amount?.toString() || '20.00')
        .replace('{deposit_link}', depositUrl)
    }

    // Queue SMS
    const { data: smsLog, error: smsError } = await supabase
      .from('sms_logs')
      .insert({
        job_id: jobId,
        template_key: templateKey,
        body_rendered: smsBody,
        status: 'PENDING',
      })
      .select()
      .single()

    if (smsError) {
      console.error('Failed to queue SMS:', smsError)
      return NextResponse.json(
        { error: 'Failed to queue SMS' },
        { status: 500 }
      )
    }

    // Automatically send the SMS
    if (smsLog) {
      try {
        console.log('📤 Triggering SMS send for job:', job.job_ref)
        // Use hardcoded URL since NEXT_PUBLIC_ vars aren't available in API routes
        const appUrl = 'https://nfd-repairs-app.vercel.app'
        const response = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        console.log('SMS send trigger response:', response.status, response.ok)
      } catch (error) {
        console.error('❌ Failed to trigger SMS send:', error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in queue-status-sms:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
