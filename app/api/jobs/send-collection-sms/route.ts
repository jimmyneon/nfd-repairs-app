import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generatePostCollectionEmail } from '@/lib/email-post-collection'
import { sendEmail } from '@/lib/email'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'
import { shortTrackingLink, shortReviewLink, getAppUrl } from '@/lib/utils'

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
    const { jobId, manual, platform } = body

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

    // Check repair outcome - skip review if not fixed
    if (job.repair_outcome === 'unrepaired') {
      return NextResponse.json({
        success: false,
        message: `Review skipped - repair outcome: ${job.repair_outcome}`,
        skipped: true
      })
    }

    // The review link is now a single landing page that shows all platforms
    // The ref parameter is the job_ref so the page can track which platforms were clicked
    const reviewLink = shortReviewLink(job.job_ref)

    // Track which platform was requested (for app display purposes)
    const completedPlatforms: string[] = job.review_platforms_completed || []
    const PLATFORM_ORDER = ['google', 'facebook', 'trustpilot']
    let selectedPlatform = platform || PLATFORM_ORDER.find(p => !completedPlatforms.includes(p)) || 'google'
    if (completedPlatforms.includes(selectedPlatform)) {
      selectedPlatform = PLATFORM_ORDER.find(p => !completedPlatforms.includes(p)) || 'all_done'
    }

    if (selectedPlatform === 'all_done') {
      return NextResponse.json({
        success: false,
        message: 'All review platforms completed',
        skipped: true,
      })
    }

    // Get first name from customer name, with a safe fallback
    const firstName = getFirstName(job.customer_name)

    // Fetch the review SMS template (single template now, links to review landing page)
    const { data: reviewTemplate } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'POST_COLLECTION_REVIEW')
      .eq('is_active', true)
      .single()

    // Build SMS message from template, or fall back to hardcoded default
    let smsBody: string
    if (reviewTemplate && reviewTemplate.body) {
      smsBody = renderSmsTemplate(reviewTemplate.body, {
        first_name: firstName,
        customer_name: job.customer_name,
        device_make: job.device_make || '',
        device_model: job.device_model || '',
        review_link: reviewLink,
        tracking_link: shortTrackingLink(job.tracking_token),
        job_ref: job.job_ref,
      })
    } else {
      // Fallback if template not in database
      smsBody = `Hi ${firstName}, thanks for choosing New Forest Device Repairs! Could you spare 2 mins to leave us a review? It really helps our small business:
${reviewLink}

If anything isn't quite right, just reply and we'll put it right.

– New Forest Device Repairs`
    }

    // Guard: don't send empty SMS to MacroDroid (causes MacroDroid failures)
    if (!smsBody || !smsBody.trim()) {
      console.error(`Post-collection SMS body is empty for job ${job.job_ref} - not sending to MacroDroid`)
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
        googleReviewLink: reviewLink
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
        last_review_platform_requested: selectedPlatform,
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
          message: `Post-collection SMS ${smsDeliveryStatus.toLowerCase()}: ${selectedPlatform} review request sent`
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

    // Also get jobs with scheduled review reminder SMS that haven't been sent yet
    const { data: reviewReminderJobs, error: reviewReminderError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name, review_platforms_completed')
      .not('review_reminder_sms_scheduled_at', 'is', null)
      .is('review_reminder_sms_sent_at', null)
      .lte('review_reminder_sms_scheduled_at', new Date().toISOString())
      .order('review_reminder_sms_scheduled_at', { ascending: true })

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

    if (reviewReminderError) {
      console.error('Error fetching review reminder SMS:', reviewReminderError)
    }

    if ((!jobs || jobs.length === 0) && (!aftercareJobs || aftercareJobs.length === 0) && (!reviewReminderJobs || reviewReminderJobs.length === 0)) {
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

        if (i < uniqueJobs.length - 1 || (aftercareJobs && aftercareJobs.length > 0) || (reviewReminderJobs && reviewReminderJobs.length > 0)) {
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

    // Send aftercare SMS directly (check-in with review link)
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
          const aftercareReviewLink = shortReviewLink(job.job_ref)
          let aftercareBody: string

          if (aftercareTemplate && aftercareTemplate.body) {
            aftercareBody = renderSmsTemplate(aftercareTemplate.body, {
              first_name: firstName,
              customer_name: job.customer_name,
              device_make: job.device_make || '',
              device_model: job.device_model || '',
              job_ref: job.job_ref,
              review_link: aftercareReviewLink,
            })
          } else {
            // Fallback if template not in database - includes review link
            aftercareBody = `Hi ${firstName}, just checking in — how's your ${job.device_model} getting on? Any issues at all, just reply here and we'll sort it.

If you're happy with the repair, a quick review really helps us:
${aftercareReviewLink}

New Forest Device Repairs`
          }

          // Guard: don't send empty SMS to MacroDroid
          if (!aftercareBody || !aftercareBody.trim()) {
            console.error(`Aftercare SMS body is empty for job ${job.job_ref} - skipping`)
            await supabase.from('jobs').update({
              aftercare_sms_sent_at: new Date().toISOString(),
              aftercare_sms_delivery_status: 'FAILED_EMPTY_BODY',
              aftercare_sms_body: '',
            }).eq('id', job.id)
            results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'aftercare', success: false, error: 'Empty SMS body' })
            continue
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

          if (i < aftercareJobs.length - 1 || (reviewReminderJobs && reviewReminderJobs.length > 0)) {
            console.log('Waiting 30 seconds before next SMS...')
            await delay(30000)
          }
        } catch (err) {
          console.error(`Error sending aftercare SMS for job ${job.job_ref}:`, err)
          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'aftercare', success: false, error: 'Failed to send' })
        }
      }
    }

    // Send review reminder SMS (only if no review link has been clicked)
    if (reviewReminderJobs && reviewReminderJobs.length > 0 && webhookUrl) {
      // Filter out jobs where the customer has already clicked a review link
      const jobsNeedingReminder = reviewReminderJobs.filter(job => {
        const clicked: string[] = job.review_platforms_completed || []
        if (clicked.length > 0) {
          console.log(`Skipping review reminder for ${job.job_ref} - already clicked review link(s): ${clicked.join(', ')}`)
          return false
        }
        return true
      })

      // Mark skipped jobs as sent (no need to remind them)
      const skippedJobIds = reviewReminderJobs.filter(job => !jobsNeedingReminder.includes(job)).map(j => j.id)
      if (skippedJobIds.length > 0) {
        await supabase
          .from('jobs')
          .update({
            review_reminder_sms_sent_at: new Date().toISOString(),
            review_reminder_sms_delivery_status: 'SKIPPED_REVIEW_CLICKED',
            review_reminder_sms_body: 'Skipped - customer already clicked a review link',
          })
          .in('id', skippedJobIds)
      }

      // Fetch the REVIEW_REMINDER template
      const { data: reminderTemplate } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'REVIEW_REMINDER')
        .eq('is_active', true)
        .single()

      console.log(`Processing ${jobsNeedingReminder.length} review reminder SMS (${skippedJobIds.length} skipped - already clicked)`)

      for (let i = 0; i < jobsNeedingReminder.length; i++) {
        const job = jobsNeedingReminder[i]

        try {
          const firstName = getFirstName(job.customer_name)
          const reminderReviewLink = shortReviewLink(job.job_ref)
          let reminderBody: string

          if (reminderTemplate && reminderTemplate.body) {
            reminderBody = renderSmsTemplate(reminderTemplate.body, {
              first_name: firstName,
              customer_name: job.customer_name,
              review_link: reminderReviewLink,
              job_ref: job.job_ref,
            })
          } else {
            // Fallback if template not in database
            reminderBody = `Hi ${firstName}, just a quick follow-up — if you haven't had a chance yet, we'd really appreciate a review. It takes 2 mins and means a lot to our small business:
${reminderReviewLink}

– New Forest Device Repairs`
          }

          // Guard: don't send empty SMS to MacroDroid
          if (!reminderBody || !reminderBody.trim()) {
            console.error(`Review reminder SMS body is empty for job ${job.job_ref} - skipping`)
            await supabase.from('jobs').update({
              review_reminder_sms_sent_at: new Date().toISOString(),
              review_reminder_sms_delivery_status: 'FAILED_EMPTY_BODY',
              review_reminder_sms_body: '',
            }).eq('id', job.id)
            results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review_reminder', success: false, error: 'Empty SMS body' })
            continue
          }

          console.log(`Sending review reminder SMS ${i + 1}/${jobsNeedingReminder.length} for job ${job.job_ref} to ${job.customer_name}`)

          const smsResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: job.customer_phone,
              message: reminderBody,
            }),
          })

          const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'
          const now = new Date().toISOString()

          await supabase
            .from('jobs')
            .update({
              review_reminder_sms_sent_at: now,
              review_reminder_sms_delivery_status: deliveryStatus,
              review_reminder_sms_body: reminderBody,
            })
            .eq('id', job.id)

          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'SYSTEM',
            message: `Review reminder SMS ${deliveryStatus.toLowerCase()}: sent (no review clicked within 5 days)`,
          })

          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review_reminder', success: smsResponse.ok, deliveryStatus })

          if (i < jobsNeedingReminder.length - 1) {
            console.log('Waiting 30 seconds before next SMS...')
            await delay(30000)
          }
        } catch (err) {
          console.error(`Error sending review reminder SMS for job ${job.job_ref}:`, err)
          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review_reminder', success: false, error: 'Failed to send' })
        }
      }
    }

    return NextResponse.json({
      success: true,
      reviewCount: uniqueJobs.length,
      aftercareCount: aftercareJobs?.length || 0,
      reviewReminderCount: reviewReminderJobs?.length || 0,
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
