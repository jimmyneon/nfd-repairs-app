import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/jobs/schedule-collection-sms
 * Called when job status changes to COLLECTED.
 *
 * 1. Sends review request SMS immediately (via POST to send-collection-sms)
 * 2. Schedules aftercare SMS (with review link) for 3 days later
 * 3. Schedules review reminder SMS for 5 days later (only sent if no review clicked)
 * 4. Schedules post-collection email for 1-3 hours later (existing behaviour)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    // Check if review request should be skipped
    if (job.skip_review_request) {
      console.log(`Review request disabled for job ${job.job_ref}`)
      return NextResponse.json({
        success: true,
        message: 'Review request disabled for this job',
        skipped: true
      })
    }

    // Check if customer is flagged as sensitive/awkward
    if (job.customer_flag === 'sensitive' || job.customer_flag === 'awkward') {
      console.log(`Review request skipped for ${job.customer_flag} customer: ${job.job_ref}`)
      await supabase
        .from('job_events')
        .insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: `Post-collection SMS skipped - customer flagged as ${job.customer_flag}`
        })

      return NextResponse.json({
        success: true,
        message: `Review request skipped - customer flagged as ${job.customer_flag}`,
        skipped: true
      })
    }

    // Check repair outcome - skip all post-collection SMS if not fixed
    if (job.repair_outcome === 'unrepaired') {
      console.log(`Post-collection SMS skipped - device not fixed: ${job.job_ref}`)
      await supabase.from('job_events').insert({
        job_id: jobId, type: 'SYSTEM',
        message: 'Post-collection SMS skipped - device was not fixed'
      })
      return NextResponse.json({ success: true, message: 'Skipped - device not fixed', skipped: true })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
    const updates: Record<string, string> = {}
    const eventMessages: string[] = []

    // 1. Send review SMS immediately (if not already sent)
    if (!job.post_collection_sms_sent_at) {
      try {
        const reviewResponse = await fetch(`${appUrl}/api/jobs/send-collection-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
        })

        const reviewResult = await reviewResponse.json()
        console.log(`Review SMS sent immediately for ${job.job_ref}:`, reviewResult.smsDeliveryStatus || reviewResult.message)
        eventMessages.push(`Review SMS sent - ${reviewResult.smsDeliveryStatus || 'unknown'}`)
      } catch (err) {
        console.error(`Failed to send review SMS for ${job.job_ref}:`, err)
        eventMessages.push('Review SMS send failed')
      }
    } else {
      eventMessages.push('Review SMS already sent')
    }

    // 2. Schedule aftercare SMS for 3 days later (if not already scheduled)
    if (!job.aftercare_sms_scheduled_at) {
      const aftercareTime = calculateAftercareTime()
      updates.aftercare_sms_scheduled_at = aftercareTime.toISOString()
      eventMessages.push(`Aftercare scheduled for ${aftercareTime.toLocaleString()}`)
    }

    // 3. Schedule review reminder SMS for 5 days later (if not already scheduled)
    if (!job.review_reminder_sms_scheduled_at) {
      const reviewReminderTime = calculateReviewReminderTime()
      updates.review_reminder_sms_scheduled_at = reviewReminderTime.toISOString()
      eventMessages.push(`Review reminder scheduled for ${reviewReminderTime.toLocaleString()}`)
    }

    // 4. Schedule email for 1-3 hours later (if not already scheduled)
    if (!job.post_collection_email_scheduled_at) {
      const emailTime = calculateEmailTime()
      updates.post_collection_email_scheduled_at = emailTime.toISOString()
    }

    // Apply all scheduled updates in one call
    if (Object.keys(updates).length > 0) {
      await supabase.from('jobs').update(updates).eq('id', jobId)
    }

    await supabase.from('job_events').insert({
      job_id: jobId, type: 'SYSTEM',
      message: eventMessages.join('. ')
    })

    return NextResponse.json({
      success: true,
      message: 'Post-collection SMS scheduled',
      aftercareScheduledAt: updates.aftercare_sms_scheduled_at || null,
      reviewReminderScheduledAt: updates.review_reminder_sms_scheduled_at || null,
    })

  } catch (error) {
    console.error('Error in schedule-collection-sms:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Calculate when to send aftercare SMS (3 days from now, within 8am-8pm)
 */
function calculateAftercareTime(): Date {
  const now = new Date()
  const aftercare = new Date(now)

  // Fixed at 3 days
  aftercare.setDate(aftercare.getDate() + 3)

  // Randomize between 10am-2pm for natural spread
  const randomHour = 10 + Math.floor(Math.random() * 4)
  const randomMinute = Math.floor(Math.random() * 60)
  aftercare.setHours(randomHour, randomMinute, 0, 0)

  // Guardrail: ensure within 8am-8pm
  const hour = aftercare.getHours()
  if (hour < 8) {
    aftercare.setHours(8, 0, 0, 0)
  } else if (hour >= 20) {
    aftercare.setHours(10, 0, 0, 0)
  }

  return aftercare
}

/**
 * Calculate when to send review reminder SMS (5 days from now, within 8am-8pm)
 * Only sent if customer hasn't clicked any review link by then
 */
function calculateReviewReminderTime(): Date {
  const now = new Date()
  const reminder = new Date(now)

  // Fixed at 5 days
  reminder.setDate(reminder.getDate() + 5)

  // Randomize between 10am-2pm for natural spread
  const randomHour = 10 + Math.floor(Math.random() * 4)
  const randomMinute = Math.floor(Math.random() * 60)
  reminder.setHours(randomHour, randomMinute, 0, 0)

  // Guardrail: ensure within 8am-8pm
  const hour = reminder.getHours()
  if (hour < 8) {
    reminder.setHours(8, 0, 0, 0)
  } else if (hour >= 20) {
    reminder.setHours(10, 0, 0, 0)
  }

  return reminder
}

/**
 * Calculate when to send post-collection email (1-3 hours later, within 8am-8pm)
 */
function calculateEmailTime(): Date {
  const now = new Date()
  const minDelay = 60 * 60 * 1000
  const maxDelay = 3 * 60 * 60 * 1000
  const randomDelay = minDelay + Math.random() * (maxDelay - minDelay)
  const emailTime = new Date(now.getTime() + randomDelay)

  const hour = emailTime.getHours()
  if (hour < 8) {
    emailTime.setHours(8, 0, 0, 0)
  } else if (hour >= 20) {
    emailTime.setDate(emailTime.getDate() + 1)
    emailTime.setHours(10, 0, 0, 0)
  }

  return emailTime
}
