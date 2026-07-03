import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generatePostCollectionEmail } from '@/lib/email-post-collection'
import { sendEmail } from '@/lib/email'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

/**
 * POST /api/jobs/send-collection-sms
 * Send scheduled post-collection SMS for a specific job
 * Can be called manually or by cron job
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await request.json()
    const { jobId, manual } = body

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

    // Also check if email already sent
    const emailAlreadySent = job?.post_collection_email_sent_at && !manual

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Check if already sent (unless manual override)
    if (job.post_collection_sms_sent_at && emailAlreadySent) {
      return NextResponse.json({
        success: false,
        message: 'Post-collection notifications already sent',
        alreadySent: true
      })
    }

    // Get Google review link from settings
    const { data: reviewLinkSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'google_review_link')
      .single()

    const googleReviewLink = reviewLinkSetting?.value || 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review'

    // Get first name from customer name, with a safe fallback
    const firstName = getFirstName(job.customer_name)

    // Fetch the POST_COLLECTION_REVIEW template from the database
    const { data: reviewTemplate } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'POST_COLLECTION_REVIEW')
      .eq('is_active', true)
      .single()

    // Build SMS message from template, or fall back to hardcoded default
    let smsBody: string
    if (reviewTemplate) {
      smsBody = renderSmsTemplate(reviewTemplate.body, {
        first_name: firstName,
        customer_name: job.customer_name,
        device_make: job.device_make || '',
        device_model: job.device_model || '',
        review_link: googleReviewLink,
        tracking_link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/t/${job.tracking_token}`,
        job_ref: job.job_ref,
      })
    } else {
      // Fallback if template not in database
      smsBody = `Hi ${firstName}, thanks for choosing New Forest Device Repairs. If you're happy with your ${job.device_model} repair, we'd really appreciate a quick Google review:
${googleReviewLink}

If anything isn't quite right, just reply to this message and we'll do our best to put it right.

– New Forest Device Repairs`
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

    console.log('Sending post-collection SMS to:', job.customer_phone)

    const smsResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: job.customer_phone,
        message: smsBody
      })
    })

    const smsDeliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

    // Send email with dynamic cross-sell content
    console.log('Sending post-collection email to:', job.customer_email)
    let emailDeliveryStatus = 'SKIPPED'
    let emailSubject = ''
    let emailBody = ''

    if (job.customer_email) {
      const emailTemplate = generatePostCollectionEmail({
        job,
        googleReviewLink
      })

      emailSubject = emailTemplate.subject
      emailBody = emailTemplate.html

      const emailResult = await sendEmail(
        job.customer_email,
        emailTemplate.subject,
        emailTemplate.html,
        emailTemplate.text
      )

      emailDeliveryStatus = emailResult.success ? 'SENT' : 'FAILED'
      console.log(`Post-collection email ${emailDeliveryStatus} for job ${job.job_ref}`)
    } else {
      console.log(`No email address for job ${job.job_ref}, skipping email`)
    }

    // Update job with sent status for both SMS and email
    const now = new Date().toISOString()
    await supabase
      .from('jobs')
      .update({
        post_collection_sms_sent_at: now,
        post_collection_sms_delivery_status: smsDeliveryStatus,
        post_collection_sms_body: smsBody,
        post_collection_email_sent_at: job.customer_email ? now : null,
        post_collection_email_delivery_status: emailDeliveryStatus,
        post_collection_email_subject: emailSubject,
        post_collection_email_body: emailBody
      })
      .eq('id', jobId)

    // Log events
    await supabase
      .from('job_events')
      .insert([
        {
          job_id: jobId,
          type: 'SYSTEM',
          message: `Post-collection SMS ${smsDeliveryStatus.toLowerCase()}: Review request sent`
        },
        job.customer_email ? {
          job_id: jobId,
          type: 'SYSTEM',
          message: `Post-collection email ${emailDeliveryStatus.toLowerCase()}: Review request with cross-sell content`
        } : null
      ].filter(Boolean))

    console.log(`Post-collection notifications sent for job ${job.job_ref}: SMS=${smsDeliveryStatus}, Email=${emailDeliveryStatus}`)

    return NextResponse.json({
      success: smsResponse.ok || (job.customer_email && emailDeliveryStatus === 'SENT'),
      smsDeliveryStatus,
      emailDeliveryStatus,
      message: `Post-collection notifications sent: SMS ${smsDeliveryStatus}, Email ${emailDeliveryStatus}`
    })

  } catch (error) {
    console.error('Error sending post-collection SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Helper function to check if current time is within allowed sending hours (8am-8pm)
 */
function isWithinAllowedHours(): boolean {
  const now = new Date()
  const hours = now.getHours()
  return hours >= 8 && hours < 20
}

/**
 * Helper function to get next allowed send time if outside hours
 */
function getNextAllowedSendTime(): Date {
  const now = new Date()
  const hours = now.getHours()
  
  if (hours < 8) {
    // Before 8am - schedule for 8am today
    const next = new Date(now)
    next.setHours(8, 0, 0, 0)
    return next
  } else {
    // After 8pm - schedule for 8am tomorrow
    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(8, 0, 0, 0)
    return next
  }
}

/**
 * Helper function to delay execution (for MacroDroid rate limiting)
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * GET /api/jobs/send-collection-sms
 * Cron endpoint to send all scheduled post-collection SMS
 * Call this every 15 minutes via Vercel Cron or external service
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify cron secret
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if we're within allowed sending hours (8am-8pm)
    if (!isWithinAllowedHours()) {
      console.log('Outside allowed sending hours (8am-8pm), skipping SMS send')
      return NextResponse.json({
        success: true,
        message: 'Outside allowed sending hours (8am-8pm)',
        count: 0,
        skipped: true
      })
    }

    // Get all jobs with scheduled review SMS that haven't been sent yet
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name')
      .not('post_collection_sms_scheduled_at', 'is', null)
      .is('post_collection_sms_sent_at', null)
      .lte('post_collection_sms_scheduled_at', new Date().toISOString())
      .order('post_collection_sms_scheduled_at', { ascending: true })

    // Also get jobs with scheduled aftercare SMS that haven't been sent yet
    const { data: aftercareJobs, error: aftercareError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name, device_make, device_model')
      .not('aftercare_sms_scheduled_at', 'is', null)
      .is('aftercare_sms_sent_at', null)
      .lte('aftercare_sms_scheduled_at', new Date().toISOString())
      .order('aftercare_sms_scheduled_at', { ascending: true })

    if (error) {
      console.error('Error fetching scheduled SMS:', error)
      return NextResponse.json(
        { error: 'Failed to fetch scheduled SMS' },
        { status: 500 }
      )
    }

    if (aftercareError) {
      console.error('Error fetching aftercare SMS:', aftercareError)
    }

    if ((!jobs || jobs.length === 0) && (!aftercareJobs || aftercareJobs.length === 0)) {
      return NextResponse.json({
        success: true,
        message: 'No scheduled SMS to send',
        count: 0
      })
    }

    // Deduplicate review SMS by phone number
    const seenPhones = new Set<string>()
    const uniqueJobs = (jobs || []).filter(job => {
      if (seenPhones.has(job.customer_phone)) {
        console.log(`Skipping duplicate for ${job.job_ref} - already sending to ${job.customer_phone}`)
        return false
      }
      seenPhones.add(job.customer_phone)
      return true
    })

    console.log(`Processing ${uniqueJobs.length} review SMS (${(jobs || []).length - uniqueJobs.length} duplicates filtered)`)

    const results = []

    // Send review SMS via POST handler (which also sends email)
    for (let i = 0; i < uniqueJobs.length; i++) {
      const job = uniqueJobs[i]

      try {
        console.log(`Sending review SMS ${i + 1}/${uniqueJobs.length} for job ${job.job_ref} to ${job.customer_name}`)

        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/api/jobs/send-collection-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id })
        })

        const result = await response.json()
        results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review', ...result })

        if (i < uniqueJobs.length - 1 || (aftercareJobs && aftercareJobs.length > 0)) {
          console.log('Waiting 30 seconds before next SMS...')
          await delay(30000)
        }
      } catch (err) {
        console.error(`Error sending review SMS for job ${job.job_ref}:`, err)
        results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review', success: false, error: 'Failed to send' })
      }
    }

    // Mark any duplicate review jobs as sent
    const duplicateJobIds = (jobs || []).filter(job => !uniqueJobs.includes(job)).map(j => j.id)
    if (duplicateJobIds.length > 0) {
      await supabase
        .from('jobs')
        .update({
          post_collection_sms_sent_at: new Date().toISOString(),
          post_collection_sms_delivery_status: 'SKIPPED_DUPLICATE',
          post_collection_sms_body: 'Skipped - duplicate phone number'
        })
        .in('id', duplicateJobIds)
    }

    // Send aftercare SMS directly (simple check-in, no review link)
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (aftercareJobs && aftercareJobs.length > 0 && webhookUrl) {
      // Fetch the AFTERCARE_CHECKIN template
      const { data: aftercareTemplate } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'AFTERCARE_CHECKIN')
        .eq('is_active', true)
        .single()

      console.log(`Processing ${aftercareJobs.length} aftercare SMS`)

      for (let i = 0; i < aftercareJobs.length; i++) {
        const job = aftercareJobs[i]

        try {
          const firstName = getFirstName(job.customer_name)
          let aftercareBody: string

          if (aftercareTemplate) {
            aftercareBody = renderSmsTemplate(aftercareTemplate.body, {
              first_name: firstName,
              customer_name: job.customer_name,
              device_make: job.device_make || '',
              device_model: job.device_model || '',
              job_ref: job.job_ref,
            })
          } else {
            // Fallback if template not in database
            aftercareBody = `Hi ${firstName}, just checking in — how's your ${job.device_model} getting on? Any issues at all, just reply here and we'll sort it.

New Forest Device Repairs`
          }

          console.log(`Sending aftercare SMS ${i + 1}/${aftercareJobs.length} for job ${job.job_ref} to ${job.customer_name}`)

          const smsResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: job.customer_phone,
              message: aftercareBody,
            }),
          })

          const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'
          const now = new Date().toISOString()

          await supabase
            .from('jobs')
            .update({
              aftercare_sms_sent_at: now,
              aftercare_sms_delivery_status: deliveryStatus,
              aftercare_sms_body: aftercareBody,
            })
            .eq('id', job.id)

          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'SYSTEM',
            message: `Aftercare SMS ${deliveryStatus.toLowerCase()}: check-in sent`,
          })

          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'aftercare', success: smsResponse.ok, deliveryStatus })

          if (i < aftercareJobs.length - 1) {
            console.log('Waiting 30 seconds before next SMS...')
            await delay(30000)
          }
        } catch (err) {
          console.error(`Error sending aftercare SMS for job ${job.job_ref}:`, err)
          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'aftercare', success: false, error: 'Failed to send' })
        }
      }
    }

    return NextResponse.json({
      success: true,
      reviewCount: uniqueJobs.length,
      aftercareCount: aftercareJobs?.length || 0,
      duplicatesSkipped: (jobs || []).length - uniqueJobs.length,
      results
    })

  } catch (error) {
    console.error('Error in cron job:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
