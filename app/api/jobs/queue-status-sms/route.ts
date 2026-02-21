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

    // Only send SMS for key status changes
    const smsStatuses = ['READY_TO_BOOK_IN', 'READY_TO_COLLECT', 'COMPLETED']
    
    if (!smsStatuses.includes(status)) {
      console.log(`Status ${status} does not trigger SMS notification`)
      return NextResponse.json({ success: true, message: 'Status does not trigger SMS' })
    }

    // Get SMS template for this status
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', status)
      .eq('is_active', true)
      .single()

    if (!template) {
      console.log(`No active SMS template found for status: ${status}`)
      return NextResponse.json({ success: true, message: 'No template for this status' })
    }

    // Build tracking URL
    const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/t/${job.tracking_token}`

    // Replace template variables
    const smsBody = template.body
      .replace('{customer_name}', job.customer_name)
      .replace('{device_make}', job.device_make)
      .replace('{device_model}', job.device_model)
      .replace('{price_total}', job.price_total?.toString() || '0')
      .replace('{tracking_link}', trackingUrl)
      .replace('{job_ref}', job.job_ref)

    // Queue SMS
    const { data: smsLog, error: smsError } = await supabase
      .from('sms_logs')
      .insert({
        job_id: jobId,
        template_key: status,
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
        // Use hardcoded URL since NEXT_PUBLIC_ vars aren't available in API routes
        const appUrl = 'https://nfd-repairs-app.vercel.app'
        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Failed to trigger SMS send:', error)
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
