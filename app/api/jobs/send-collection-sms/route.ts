import { NextRequest, NextResponse } from 'next/server'
import { generatePostCollectionEmail } from '@/lib/email-post-collection'
import { sendEmail } from '@/lib/email'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortTrackingLink, shortReviewLink, getAppUrl } from '@/lib/utils'
import { createServiceClient, supabaseRetry, sendViaMacroDroid, isWithinUKSendingHours } from '@/lib/resilience'

// Allow up to 5 minutes for the cron handler (it has 30s delays between sends)
export const maxDuration = 300

/**
 * POST /api/jobs/send-collection-sms
 * Send scheduled post-collection SMS for a specific job
 * Can be called manually or by cron job
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()

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

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Retry each channel independently. A failed SMS must never resend an
    // email that already succeeded (and vice versa). Staff can still resend
    // deliberately using the existing manual override.
    const shouldSendSms = manual === true || !job.post_collection_sms_sent_at
    const shouldSendEmail = Boolean(job.customer_email) &&
      (manual === true || !job.post_collection_email_sent_at)

    if (!shouldSendSms && !shouldSendEmail) {
      return NextResponse.json({
        success: false,
        message: 'Post-collection notifications already sent',
        alreadySent: true
      })
    }

    // Check repair outcome - skip review if not fixed
    if (job.repair_outcome === 'unrepaired') {
      // Mark as sent so cron doesn't keep retrying
      await supabase.from('jobs').update({
        post_collection_sms_sent_at: new Date().toISOString(),
        post_collection_sms_delivery_status: 'SKIPPED_UNREPAIRED',
      }).eq('id', jobId)
      return NextResponse.json({
        success: false,
        message: `Review skipped - repair outcome: ${job.repair_outcome}`,
        skipped: true
      })
    }

    // Check if review request was disabled after scheduling
    if (job.skip_review_request) {
      await supabase.from('jobs').update({
        post_collection_sms_sent_at: new Date().toISOString(),
        post_collection_sms_delivery_status: 'SKIPPED_REVIEW_DISABLED',
      }).eq('id', jobId)
      return NextResponse.json({
        success: false,
        message: 'Review request disabled for this job',
        skipped: true
      })
    }

    // Check if customer was flagged as sensitive/awkward after scheduling
    if (job.customer_flag === 'sensitive' || job.customer_flag === 'awkward') {
      await supabase.from('jobs').update({
        post_collection_sms_sent_at: new Date().toISOString(),
        post_collection_sms_delivery_status: `SKIPPED_${job.customer_flag.toUpperCase()}`,
      }).eq('id', jobId)
      return NextResponse.json({
        success: false,
        message: `Review skipped - customer flagged as ${job.customer_flag}`,
        skipped: true
      })
    }

    // The review link is now a single landing page that shows all platforms
    // The ref parameter is the job_ref so the page can track which platforms were clicked
    const reviewLink = shortReviewLink(job.job_ref)

    // Track which platform was requested (for app display purposes)
    const completedPlatforms: string[] = job.review_platforms_completed || []
    const PLATFORM_ORDER = ['google', 'trustpilot']
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

    const events: any[] = []
    let smsDeliveryStatus = job.post_collection_sms_delivery_status || 'SKIPPED'
    let emailDeliveryStatus = job.post_collection_email_delivery_status || 'SKIPPED'

    // Persist each channel immediately, before trying the other one. Surface
    // database errors instead of reporting a successful send with no record.
    const recordDelivery = async (updates: Record<string, unknown>) => {
      const result: any = await supabaseRetry(() =>
        supabase.from('jobs').update(updates).eq('id', jobId)
      )
      if (result.error) throw result.error
    }

    if (shouldSendSms) {
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
          device_model: safeDeviceLabel(job.device_make, job.device_model),
          device_summary: safeDeviceLabel(job.device_make, job.device_model),
          review_link: reviewLink,
          tracking_link: shortTrackingLink(job.short_token || job.tracking_token),
          job_ref: job.job_ref,
        })
      } else {
        // Fallback if template not in database
        smsBody = `Hi ${firstName}!\n\nHope you are happy with your ${job.device_model || 'device'} repair!\n\nIf so, a 5-star Google review would mean the world to our small business:\n\nIt takes 60 seconds — just tap here:\n${reviewLink}\n\nIf anything is not right, please text us — we will sort it.\n\nNFD Repairs`
      }

      // SMS configuration/template failures must not block an email-only retry.
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      const smsResult = webhookUrl && smsBody?.trim()
        ? await sendViaMacroDroid(webhookUrl, job.customer_phone, smsBody)
        : { ok: false }
      smsDeliveryStatus = smsResult.ok ? 'SENT' : 'FAILED'

      await recordDelivery({
        ...(smsResult.ok ? { post_collection_sms_sent_at: new Date().toISOString() } : {}),
        post_collection_sms_delivery_status: smsDeliveryStatus,
        post_collection_sms_body: smsBody,
        last_review_platform_requested: selectedPlatform,
      })
      events.push({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Post-collection SMS ${smsDeliveryStatus.toLowerCase()}: ${selectedPlatform} review request`,
      })
    }

    // Send email with dynamic cross-sell content
    if (shouldSendEmail) {
      const emailTemplate = generatePostCollectionEmail({
        job,
        googleReviewLink: reviewLink
      })

      const emailResult = await sendEmail(
        job.customer_email,
        emailTemplate.subject,
        emailTemplate.html,
        emailTemplate.text
      )

      emailDeliveryStatus = emailResult.success ? 'SENT' : 'FAILED'
      await recordDelivery({
        ...(emailResult.success ? { post_collection_email_sent_at: new Date().toISOString() } : {}),
        post_collection_email_delivery_status: emailDeliveryStatus,
        post_collection_email_subject: emailTemplate.subject,
        post_collection_email_body: emailTemplate.html,
      })
      events.push({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Post-collection email ${emailDeliveryStatus.toLowerCase()}: Review request with cross-sell content`,
      })
    }

    // Only log attempts made by this call; retain previous channel metadata.
    if (events.length > 0) {
      await supabase.from('job_events').insert(events)
    }

    console.log(`Post-collection notifications sent for job ${job.job_ref}: SMS=${smsDeliveryStatus}, Email=${emailDeliveryStatus}`)

    return NextResponse.json({
      success: smsDeliveryStatus === 'SENT' || emailDeliveryStatus === 'SENT',
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
 * Helper function to check if current time is within allowed sending hours (8am-8pm UK time)
 * Uses UK timezone to handle BST/GMT correctly on Vercel (which runs in UTC).
 */

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
    const supabase = createServiceClient()

    // Verify cron secret
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if we're within allowed sending hours (8am-8pm UK time)
    if (!isWithinUKSendingHours()) {
      console.log('Outside allowed sending hours (8am-8pm UK), skipping SMS send')
      return NextResponse.json({
        success: true,
        message: 'Outside allowed sending hours (8am-8pm UK)',
        count: 0,
        skipped: true
      })
    }

    // Retry pending SMS or an explicitly failed email. Do not backfill old
    // jobs that never had an email attempt, or retry deliberately skipped jobs.
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name, post_collection_sms_sent_at')
      .not('post_collection_sms_scheduled_at', 'is', null)
      .or('post_collection_sms_sent_at.is.null,and(post_collection_sms_delivery_status.eq.SENT,post_collection_email_sent_at.is.null,post_collection_email_delivery_status.eq.FAILED,customer_email.not.is.null,customer_email.neq."")')
      .lte('post_collection_sms_scheduled_at', new Date().toISOString())
      .order('post_collection_sms_scheduled_at', { ascending: true })

    // Also get jobs with scheduled aftercare SMS that haven't been sent yet
    // (exclude flagged/skipped customers and unrepaired devices)
    const { data: aftercareJobs, error: aftercareError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name, device_make, device_model')
      .not('aftercare_sms_scheduled_at', 'is', null)
      .is('aftercare_sms_sent_at', null)
      .lte('aftercare_sms_scheduled_at', new Date().toISOString())
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
      .or('repair_outcome.is.null,repair_outcome.eq.repaired')
      .order('aftercare_sms_scheduled_at', { ascending: true })

    // Also get jobs with scheduled review reminder SMS that haven't been sent yet
    // (exclude flagged/skipped customers and unrepaired devices)
    const { data: reviewReminderJobs, error: reviewReminderError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name, review_platforms_completed')
      .not('review_reminder_sms_scheduled_at', 'is', null)
      .is('review_reminder_sms_sent_at', null)
      .lte('review_reminder_sms_scheduled_at', new Date().toISOString())
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
      .or('repair_outcome.is.null,repair_outcome.eq.repaired')
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
      // Email-only retries must not consume or be removed by SMS deduplication.
      if (job.post_collection_sms_sent_at) return true
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
              device_model: safeDeviceLabel(job.device_make, job.device_model),
              device_summary: safeDeviceLabel(job.device_make, job.device_model),
              job_ref: job.job_ref,
              review_link: aftercareReviewLink,
            })
          } else {
            // Fallback if template not in database - includes review link
            aftercareBody = `Hi ${firstName},\n\nJust checking in — how is your ${job.device_model} getting on? Any issues at all, just reply here and we will sort it.\n\nIf you are happy with the repair, a quick review really helps us →\n${aftercareReviewLink}\n\nNFD Repairs`
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
              .eq('id', job.id)
          )

          await supabaseRetry(() =>
            supabase.from('job_events').insert({
              job_id: job.id,
              type: 'SYSTEM',
              message: `Aftercare SMS ${deliveryStatus.toLowerCase()}: check-in sent`,
            } as any)
          )

          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'aftercare', success: smsResult.ok, deliveryStatus })

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
            reminderBody = `Hi ${firstName},\n\nJust a quick follow-up — if you have not had a chance yet, we would really appreciate a review.\n\nIt takes 2 mins and means a lot to our small business:\n${reminderReviewLink}\n\nNFD Repairs`
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

          const smsResult = await sendViaMacroDroid(webhookUrl, job.customer_phone, reminderBody)

          const deliveryStatus = smsResult.ok ? 'SENT' : 'FAILED'
          const now = new Date().toISOString()

          // Only write sent_at if actually sent
          await supabaseRetry(() =>
            supabase
              .from('jobs')
              .update({
                ...(smsResult.ok ? { review_reminder_sms_sent_at: now } : {}),
                review_reminder_sms_delivery_status: deliveryStatus,
                review_reminder_sms_body: reminderBody,
              })
              .eq('id', job.id)
          )

          await supabaseRetry(() =>
            supabase.from('job_events').insert({
              job_id: job.id,
              type: 'SYSTEM',
              message: `Review reminder SMS ${deliveryStatus.toLowerCase()}: sent (no review clicked within 5 days)`,
            } as any)
          )

          results.push({ jobRef: job.job_ref, customerName: job.customer_name, type: 'review_reminder', success: smsResult.ok, deliveryStatus })

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
