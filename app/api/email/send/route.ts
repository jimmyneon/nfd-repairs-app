import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'
import { customerStatusMessage } from '@/lib/status-messages'
import { repairPaymentLink, shortTrackingLink, shortFastDropoffLink } from '@/lib/utils'
import { createServiceClient, supabaseRetry } from '@/lib/resilience'
import { requireStaffOrCron } from '@/lib/api-auth'

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json()
    const { jobId, type, sendPriceInSms } = body

    if (!jobId || !type) {
      return NextResponse.json(
        { error: 'Missing jobId or type' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

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
        .select('send_sms, send_email, is_active')
        .eq('status_key', job.status)
        .single()

      console.log('📋 Notification config:', config)

      // If a status is normally SMS-only but this customer has no phone,
      // use email as the fallback channel so email-only customers still
      // receive the same important journey update.
      const hasPhone = !!String(job.customer_phone || '').trim()
      const emailFallbackForSms = !hasPhone && config?.send_sms === true

      if (config && !config.is_active) {
        console.log(`⚠️ Notifications disabled for status: ${job.status}`)
        return NextResponse.json({
          success: true,
          message: `Notifications disabled for ${job.status}`
        })
      }

      if (config && !config.send_email && !emailFallbackForSms) {
        console.log(`⚠️ Email disabled for status: ${job.status}`)
        return NextResponse.json({
          success: true,
          message: `Email notifications disabled for ${job.status}`
        })
      }

      if (emailFallbackForSms && !config?.send_email) {
        console.log(`✓ Using email fallback for SMS-only status: ${job.status}`)
      } else {
        console.log('✓ Email enabled for this status')
      }
    }

    const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)
    const fastDropoffUrl =
      !job.device_in_shop &&
      !job.terms_accepted &&
      job.tracking_token &&
      (job.status === 'AWAITING_DEVICE' || job.status === 'PARTS_ARRIVED')
        ? shortFastDropoffLink(job.tracking_token)
        : undefined
    const depositUrl = repairPaymentLink(job)

    const emailTemplate = generateEmbeddedJobEmail(
      {
        job,
        trackingUrl,
        depositUrl,
        statusMessage: type === 'STATUS_UPDATE' ? customerStatusMessage(job) : undefined,
        fastDropoffUrl,
        includePrice: sendPriceInSms !== false,
      },
      type as 'JOB_CREATED' | 'STATUS_UPDATE'
    )

    // Log email attempt
    console.log('📝 Creating email log entry...')
    const { data: emailLog, error: logError }: any = await supabaseRetry(() =>
      supabase
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
    )

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
        await supabaseRetry(() =>
          supabase
            .from('email_logs')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
              resend_id: result.data?.id || null,
            })
            .eq('id', emailLog.id)
        )
      }

      await supabaseRetry(() =>
        supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: `Email sent: ${emailTemplate.subject}`,
        } as any)
      )

      return NextResponse.json({ success: true })
    } else {
      // Update email log as failed
      if (emailLog) {
        await supabaseRetry(() =>
          supabase
            .from('email_logs')
            .update({
              status: 'FAILED',
              error_message: JSON.stringify(result.error),
            })
            .eq('id', emailLog.id)
        )
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

