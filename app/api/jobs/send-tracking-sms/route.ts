import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, fetchWithTimeout, isSmsConfigured } from '@/lib/resilience'
import { getFirstName } from '@/lib/sms-template'
import { shortTrackingLink } from '@/lib/utils'
import { requireStaffUser } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()

  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Get tracking link SMS template
    const { data: template, error: templateError } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'TRACKING_LINK_ONLY')
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      console.error('Template not found:', templateError)
      return NextResponse.json({ error: 'SMS template not found' }, { status: 404 })
    }

    // Build tracking URL
    const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)

    // Replace variables in template
    const smsBody = template.body
      .replace('{customer_name}', job.customer_name)
      .replace('{first_name}', getFirstName(job.customer_name))
      .replace('{tracking_link}', trackingUrl)
      .replace('{device_make}', job.device_make)
      .replace('{device_model}', job.device_model)
      .replace('{job_ref}', job.job_ref)

    const hasPhone = !!String(job.customer_phone || '').trim()
    const hasEmail = !!String(job.customer_email || '').trim()

    if (!hasPhone && hasEmail) {
      const escapedBody = smsBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
      const subject = `Your repair tracking link - ${job.job_ref}`
      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${escapedBody}</p></div>`
      const emailResult = await sendEmail(job.customer_email, subject, htmlBody, smsBody)

      await supabase.from('email_logs').insert({
        job_id: job.id,
        template_key: 'TRACKING_LINK_ONLY',
        recipient_email: job.customer_email,
        subject,
        body_text: smsBody,
        body_html: htmlBody,
        status: emailResult.success ? 'SENT' : 'FAILED',
        sent_at: emailResult.success ? new Date().toISOString() : null,
      })

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Tracking link email ${emailResult.success ? 'sent' : 'failed'}`,
      })

      return NextResponse.json({
        success: emailResult.success,
        channel: 'email',
      })
    }

    if (!hasPhone) {
      return NextResponse.json({ error: 'No phone number or email address on this job' }, { status: 400 })
    }

    // Insert SMS log
    const { data: smsLog } = await supabase.from('sms_logs').insert({
      job_id: job.id,
      phone_number: job.customer_phone,
      message: smsBody,
      status: 'pending',
      template_key: 'TRACKING_LINK_ONLY',
    }).select().single()

    if (!smsLog) {
      return NextResponse.json({ error: 'Failed to create SMS log' }, { status: 500 })
    }

    // Send via SMS transport (relay or MacroDroid)
    if (isSmsConfigured()) {
      try {
        const { sendSms } = await import('@/lib/resilience')
        const result = await sendSms(job.customer_phone, smsBody)

        if (result.ok) {
          if (result.queued && result.relayMessageId) {
            // Relay: queued, not sent yet — store relay message_id for poll cron
            await supabase
              .from('sms_logs')
              .update({ status: 'pending', error_message: `relay_message_id:${result.relayMessageId}` })
              .eq('id', smsLog.id)
          } else {
            // MacroDroid: fire-and-forget, treat as sent
            await supabase
              .from('sms_logs')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', smsLog.id)
          }
        }
      } catch (sendError) {
        console.error('SMS send error:', sendError)
      }
    }

    return NextResponse.json({ success: true, smsLogId: smsLog.id })
  } catch (error) {
    console.error('Send tracking SMS error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
