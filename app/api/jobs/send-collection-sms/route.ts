import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generatePostCollectionEmail } from '@/lib/email-post-collection'
import { sendEmail } from '@/lib/email'

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

    // Get first name from customer name
    const firstName = job.customer_name.split(' ')[0]

    // Build SMS message
    const smsBody = `Hi ${firstName}, thanks again for choosing New Forest Device Repairs - your ${job.device_model} is all sorted.

If everything's working well, we'd really appreciate a quick 5-star review - it helps other local customers find us:
${googleReviewLink}

If you do have any issues at all, just reply to this message and we'll sort it quickly.

We also repair phones, laptops, tablets and more - so feel free to reach out anytime.

Thanks for supporting a local business!`

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

    // Get all jobs with scheduled SMS that haven't been sent yet
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone, customer_name')
      .not('post_collection_sms_scheduled_at', 'is', null)
      .is('post_collection_sms_sent_at', null)
      .lte('post_collection_sms_scheduled_at', new Date().toISOString())
      .order('post_collection_sms_scheduled_at', { ascending: true })

    if (error) {
      console.error('Error fetching scheduled SMS:', error)
      return NextResponse.json(
        { error: 'Failed to fetch scheduled SMS' },
        { status: 500 }
      )
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scheduled SMS to send',
        count: 0
      })
    }

    // Deduplicate by phone number to prevent sending multiple SMS to same customer
    const seenPhones = new Set<string>()
    const uniqueJobs = jobs.filter(job => {
      if (seenPhones.has(job.customer_phone)) {
        console.log(`Skipping duplicate for ${job.job_ref} - already sending to ${job.customer_phone}`)
        return false
      }
      seenPhones.add(job.customer_phone)
      return true
    })

    console.log(`Processing ${uniqueJobs.length} scheduled post-collection SMS (${jobs.length - uniqueJobs.length} duplicates filtered)`)

    // Send each SMS with 30-second delay between sends (MacroDroid requirement)
    const results = []
    for (let i = 0; i < uniqueJobs.length; i++) {
      const job = uniqueJobs[i]
      
      try {
        console.log(`Sending SMS ${i + 1}/${uniqueJobs.length} for job ${job.job_ref} to ${job.customer_name}`)
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/api/jobs/send-collection-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id })
        })
        
        const result = await response.json()
        results.push({ jobRef: job.job_ref, customerName: job.customer_name, ...result })
        
        // Wait 30 seconds before next SMS (except for last one)
        if (i < uniqueJobs.length - 1) {
          console.log('Waiting 30 seconds before next SMS...')
          await delay(30000)
        }
      } catch (err) {
        console.error(`Error sending SMS for job ${job.job_ref}:`, err)
        results.push({ jobRef: job.job_ref, customerName: job.customer_name, success: false, error: 'Failed to send' })
      }
    }

    // Mark any duplicate jobs as sent (to prevent retry loops)
    const duplicateJobIds = jobs.filter(job => !uniqueJobs.includes(job)).map(j => j.id)
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

    return NextResponse.json({
      success: true,
      count: uniqueJobs.length,
      duplicatesSkipped: jobs.length - uniqueJobs.length,
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
