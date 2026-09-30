import { NextRequest, NextResponse } from 'next/server'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortReviewLink } from '@/lib/utils'
import { createServiceClient, supabaseRetry, sendSms } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'
import { requireStaffOrCron } from '@/lib/api-auth'

export const maxDuration = 300;

/**
 * POST /api/jobs/send-aftercare-sms
 * Manually send an aftercare check-in SMS for a specific job.
 * This is triggered by the "Aftercare" button on the job detail page.
 * Unlike the old automatic scheduling, this is opt-in only.
 */
export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const supabase = createServiceClient()

    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

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

    // Check if already sent
    if (job.aftercare_sms_sent_at) {
      return NextResponse.json({
        success: false,
        message: 'Aftercare SMS already sent for this job',
        alreadySent: true
      })
    }

    // Check if review request was disabled
    if (job.skip_review_request) {
      return NextResponse.json({
        success: false,
        message: 'Review request disabled for this job',
        skipped: true
      })
    }

    // Check if customer was flagged as sensitive/awkward
    if (job.customer_flag === 'sensitive' || job.customer_flag === 'awkward') {
      return NextResponse.json({
        success: false,
        message: `Aftercare skipped - customer flagged as ${job.customer_flag}`,
        skipped: true
      })
    }

    // Check repair outcome - skip if not fixed
    if (job.repair_outcome === 'unrepaired') {
      return NextResponse.json({
        success: false,
        message: 'Aftercare skipped - device was not fixed',
        skipped: true
      })
    }

    // Build the aftercare SMS
    const firstName = getFirstName(job.customer_name)
    const aftercareReviewLink = shortReviewLink(job.job_ref)

    // Fetch the AFTERCARE_CHECKIN template
    const { data: aftercareTemplate } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'AFTERCARE_CHECKIN')
      .eq('is_active', true)
      .single()

    let aftercareBody: string
    if (aftercareTemplate && aftercareTemplate.body) {
      aftercareBody = renderSmsTemplate(aftercareTemplate.body, {
        first_name: firstName,
        customer_name: job.customer_name,
        device_make: job.device_make || '',
        device_model: safeDeviceLabel(job.device_make, job.device_model),
        device_summary: safeDeviceLabel(job.device_make, job.device_model),
        job_ref: job.job_ref,
        review_link: aftercareReviewLink,
      })
    } else {
      // Fallback if template not in database
      aftercareBody = `Hi ${firstName},\n\nJust checking in — how is your ${job.device_model} getting on? Any issues at all, just reply here and we will sort it.\n\nIf you are happy with the repair, a quick review really helps us →\n${aftercareReviewLink}\n\nNFD Repairs`
    }

    // Guard: don't send empty SMS
    if (!aftercareBody || !aftercareBody.trim()) {
      console.error(`Aftercare SMS body is empty for job ${job.job_ref} - not sending`)
      return NextResponse.json(
        { error: 'SMS body is empty - template may be missing or malformed' },
        { status: 500 }
      )
    }

    const hasPhone = !!String(job.customer_phone || '').trim()
    const hasEmail = !!String(job.customer_email || '').trim()
    const now = new Date().toISOString()

    if (!hasPhone && !hasEmail) {
      return NextResponse.json(
        { error: 'No phone number or email address on this job' },
        { status: 400 }
      )
    }

    let deliveryStatus = 'FAILED'
    let channel: 'sms' | 'email' = hasPhone ? 'sms' : 'email'

    if (hasPhone) {
      console.log(`Sending manual aftercare SMS for job ${job.job_ref} to ${job.customer_phone}`)
      const smsResult = await sendSms(job.customer_phone, aftercareBody)
      deliveryStatus = smsResult.ok ? 'SENT' : 'FAILED'
    } else {
      const emailResult = await sendEmail(
        job.customer_email,
        `How is your repair going? - ${job.job_ref}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${aftercareBody}</p></div>`,
        aftercareBody
      )
      deliveryStatus = emailResult.success ? 'SENT' : 'FAILED'

      await supabase.from('email_logs').insert({
        job_id: jobId,
        template_key: 'AFTERCARE_CHECKIN',
        recipient_email: job.customer_email,
        subject: `How is your repair going? - ${job.job_ref}`,
        body_text: aftercareBody,
        body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${aftercareBody}</p></div>`,
        status: deliveryStatus,
        sent_at: deliveryStatus === 'SENT' ? now : null,
      })
    }

    await supabaseRetry(() =>
      supabase
        .from('jobs')
        .update({
          ...(deliveryStatus === 'SENT' ? { aftercare_sms_sent_at: now } : {}),
          aftercare_sms_delivery_status: deliveryStatus,
          aftercare_sms_body: aftercareBody,
        })
        .eq('id', jobId)
    )

    await supabaseRetry(() =>
      supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Aftercare ${channel} ${deliveryStatus.toLowerCase()}: check-in sent manually`,
      } as any)
    )

    return NextResponse.json({
      success: deliveryStatus === 'SENT',
      deliveryStatus,
      channel,
      message: `Aftercare ${channel} ${deliveryStatus.toLowerCase()}`
    })

  } catch (error) {
    console.error('Error sending aftercare SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
