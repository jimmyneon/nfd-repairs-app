import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, type } = body

    if (!jobId || !type) {
      return NextResponse.json(
        { error: 'Missing jobId or type' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      console.log('❌ Job not found:', jobError)
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }
    console.log('✓ Job found:', job.job_ref, 'Status:', job.status)

    if (!job.customer_email) {
      console.log('⚠️ No customer email on job')
      return NextResponse.json(
        { success: true, message: 'No email address on file' }
      )
    }
    console.log('✓ Customer email:', job.customer_email)

    // Check notification config to see if email should be sent for this status
    if (type === 'STATUS_UPDATE') {
      console.log('🔍 Checking notification config for status:', job.status)
      const { data: config } = await supabase
        .from('notification_config')
        .select('send_email, is_active')
        .eq('status_key', job.status)
        .single()

      console.log('📋 Notification config:', config)

      if (config && (!config.send_email || !config.is_active)) {
        console.log(`⚠️ Email disabled for status: ${job.status}`)
        return NextResponse.json({ 
          success: true, 
          message: `Email notifications disabled for ${job.status}` 
        })
      }
      console.log('✓ Email enabled for this status')
    }

    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const trackingUrl = `${appUrl}/t/${job.tracking_token}`
    const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'

    const statusMessages: Record<string, string> = {
      'QUOTE_APPROVED': 'Your repair quote has been approved! Please drop off your device at New Forest Device Repairs to begin the repair.',
      'DROPPED_OFF': 'We have received your device and will begin the repair process.',
      'RECEIVED': 'We have received your device and will assess it shortly.',
      'AWAITING_DEPOSIT': 'We need a deposit to order the parts for your repair. Please use the payment link below.',
      'PARTS_ORDERED': 'Parts have been ordered and we\'ll notify you when they arrive.',
      'PARTS_ARRIVED': 'Great news! The parts for your repair have arrived. We\'re ready to start your repair.',
      'IN_REPAIR': 'Our technicians are working on your repair. We\'ll update you when it\'s ready.',
      'READY_TO_COLLECT': 'Your repair is complete! Your device is ready to collect at New Forest Device Repairs.',
      'COLLECTED': 'Thank you for collecting your device!',
      'COMPLETED': 'Thank you for choosing New Forest Device Repairs!',
      'CANCELLED': 'This repair has been cancelled. If you have any questions, please contact us.',
      'DELAYED': 'Your repair is experiencing a delay. We\'ll contact you with more information shortly.',
    }

    const emailTemplate = generateEmbeddedJobEmail(
      {
        job,
        trackingUrl,
        depositUrl: job.deposit_required ? depositUrl : undefined,
        statusMessage: type === 'STATUS_UPDATE' ? statusMessages[job.status] : undefined
      },
      type as 'JOB_CREATED' | 'STATUS_UPDATE'
    )

    // Log email attempt
    console.log('📝 Creating email log entry...')
    const { data: emailLog, error: logError } = await supabase
      .from('email_logs')
      .insert({
        job_id: jobId,
        template_key: type,
        subject: emailTemplate.subject,
        body_html: emailTemplate.html,
        body_text: emailTemplate.text,
        recipient_email: job.customer_email,
        status: 'PENDING',
      })
      .select()
      .single()

    if (logError) {
      console.error('❌ Failed to create email log:', logError)
    } else {
      console.log('✓ Email log created:', emailLog?.id)
    }

    console.log('📤 Calling sendEmail function...')
    const result = await sendEmail(
      job.customer_email,
      emailTemplate.subject,
      emailTemplate.html,
      emailTemplate.text
    )
    console.log('📬 sendEmail result:', result)

    if (result.success) {
      // Update email log as sent
      if (emailLog) {
        await supabase
          .from('email_logs')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
            resend_id: result.data?.id || null,
          })
          .eq('id', emailLog.id)
      }

      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Email sent: ${emailTemplate.subject}`,
      })

      return NextResponse.json({ success: true })
    } else {
      // Update email log as failed
      if (emailLog) {
        await supabase
          .from('email_logs')
          .update({
            status: 'FAILED',
            error_message: JSON.stringify(result.error),
          })
          .eq('id', emailLog.id)
      }

      console.error('Failed to send email:', result.error)
      return NextResponse.json(
        { error: 'Failed to send email', details: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in email send:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
