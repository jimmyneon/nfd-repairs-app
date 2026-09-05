import { NextRequest, NextResponse } from 'next/server'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortReviewLink } from '@/lib/utils'
import { createServiceClient, supabaseRetry, sendViaMacroDroid } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'

export const maxDuration = 300;

/**
 * POST /api/jobs/send-aftercare-sms
 * Manually send an aftercare check-in SMS for a specific job.
 * This is triggered by the "Aftercare" button on the job detail page.
 * Unlike the old automatic scheduling, this is opt-in only.
 */
export async function POST(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

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
      aftercareBody = `Hi ${firstName}, just checking in — how is your ${job.device_model} getting on? Any issues at all, just reply here and we will sort it.

If you are happy with the repair, a quick review really helps us →
${aftercareReviewLink}

New Forest Device Repairs`
    }

    // Guard: don't send empty SMS
    if (!aftercareBody || !aftercareBody.trim()) {
      console.error(`Aftercare SMS body is empty for job ${job.job_ref} - not sending`)
      return NextResponse.json(
        { error: 'SMS body is empty - template may be missing or malformed' },
        { status: 500 }
      )
    }

    // Send SMS via MacroDroid
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      console.error('MACRODROID_WEBHOOK_URL not configured')
      return NextResponse.json(
        { error: 'SMS webhook not configured' },
        { status: 500 }
      )
    }

    console.log(`Sending manual aftercare SMS for job ${job.job_ref} to ${job.customer_phone}`)

    const smsResult = await sendViaMacroDroid(webhookUrl, job.customer_phone, aftercareBody)

    const deliveryStatus = smsResult.ok ? 'SENT' : 'FAILED'
    const now = new Date().toISOString()

    // Only write sent_at if actually sent — otherwise the cron never retries it
    await supabaseRetry(() =>
      supabase
        .from('jobs')
        .update({
          ...(smsResult.ok ? { aftercare_sms_sent_at: now } : {}),
          aftercare_sms_delivery_status: deliveryStatus,
          aftercare_sms_body: aftercareBody,
        })
        .eq('id', jobId)
    )

    await supabaseRetry(() =>
      supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Aftercare SMS ${deliveryStatus.toLowerCase()}: check-in sent manually`,
      } as any)
    )

    console.log(`Aftercare SMS ${deliveryStatus} for job ${job.job_ref}`)

    return NextResponse.json({
      success: smsResult.ok,
      deliveryStatus,
      message: `Aftercare SMS ${deliveryStatus.toLowerCase()}`
    })

  } catch (error) {
    console.error('Error sending aftercare SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
