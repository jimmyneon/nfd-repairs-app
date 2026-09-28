import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { requireStaffUser } from '@/lib/api-auth'
import { sendSms, isSmsConfigured } from '@/lib/resilience'

/**
 * POST /api/sms/send-custom
 * Send a custom SMS (and optionally email) to a customer from the app.
 * Logs everything to sms_logs, email_logs, and job_events for audit trail.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaffUser(request)
    if (auth.response) return auth.response

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { jobId, message, sendEmail: shouldSendEmail } = await request.json()

    if (!jobId || !message?.trim()) {
      return NextResponse.json(
        { error: 'jobId and message are required' },
        { status: 400 }
      )
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_email, customer_name')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const smsBody = message.trim()
    const now = new Date().toISOString()

    const hasPhone = !!job.customer_phone?.trim()
    const wantsEmail = !!shouldSendEmail && !!job.customer_email

    // No deliverable channel — nothing to do
    if (!hasPhone && !wantsEmail) {
      return NextResponse.json(
        { error: job.customer_email ? 'No phone number on this job — tick "Also email" to send it by email' : 'No phone number or email on this job' },
        { status: 400 }
      )
    }

    // 1. Queue SMS in sms_logs — skipped entirely when the job has no phone,
    // so no dead PENDING/FAILED rows land in the conversation thread
    let smsLog: { id: string } | null = null
    let smsDeliveryStatus = 'SKIPPED'

    if (hasPhone) {
      const { data: logRow, error: smsLogError } = await supabase
        .from('sms_logs')
        .insert({
          job_id: jobId,
          template_key: 'CUSTOM',
          body_rendered: smsBody,
          status: 'PENDING',
        })
        .select()
        .single()

      if (smsLogError || !logRow) {
        console.error('Failed to log custom SMS:', smsLogError)
        return NextResponse.json({ error: 'Failed to log SMS' }, { status: 500 })
      }
      smsLog = logRow
      const smsLogId = logRow.id
      smsDeliveryStatus = 'FAILED'

      // 2. Send via MacroDroid
      if (isSmsConfigured()) {
        try {
          const smsResponse = await sendSms(job.customer_phone, smsBody)

          smsDeliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

          await supabase
            .from('sms_logs')
            .update({
              status: smsDeliveryStatus,
              sent_at: smsDeliveryStatus === 'SENT' ? now : null,
            })
            .eq('id', smsLogId)
        } catch (err) {
          console.error('MacroDroid send failed:', err)
          await supabase
            .from('sms_logs')
            .update({ status: 'FAILED', error_message: 'Send failed' })
            .eq('id', smsLogId)
        }
      } else {
        console.error('MACRODROID_WEBHOOK_URL not configured')
      }
    }

    // 3. Send email if requested and email address exists
    let emailDeliveryStatus = 'SKIPPED'
    if (shouldSendEmail && job.customer_email) {
      try {
        const emailResult = await sendEmail(
          job.customer_email,
          'Message from New Forest Device Repairs',
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p style="white-space: pre-line;">${smsBody}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">New Forest Device Repairs</p>
          </div>`,
          smsBody
        )
        emailDeliveryStatus = emailResult.success ? 'SENT' : 'FAILED'

        // Log email
        await supabase.from('email_logs').insert({
          job_id: jobId,
          subject: 'Message from New Forest Device Repairs',
          body: smsBody,
          status: emailDeliveryStatus,
        })
      } catch (err) {
        console.error('Email send failed:', err)
        emailDeliveryStatus = 'FAILED'
      }
    }

    // 4. Log job event
    const channelSummary = hasPhone
      ? `SMS (${smsDeliveryStatus})${shouldSendEmail ? ` + email (${emailDeliveryStatus})` : ''}`
      : `email (${emailDeliveryStatus})`
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Custom message sent via ${channelSummary}: "${smsBody.substring(0, 80)}${smsBody.length > 80 ? '...' : ''}"`,
    })

    // Success if ANY channel actually delivered — an email-only job reporting
    // "failed" because SMS couldn't send is wrong when the email went out.
    return NextResponse.json({
      success: smsDeliveryStatus === 'SENT' || emailDeliveryStatus === 'SENT',
      smsDeliveryStatus,
      emailDeliveryStatus,
      smsLogId: smsLog?.id || null,
    })
  } catch (error) {
    console.error('Error in send-custom:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
