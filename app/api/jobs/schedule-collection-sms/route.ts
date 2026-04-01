import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/jobs/schedule-collection-sms
 * Schedule post-collection SMS when job status changes to COLLECTED
 * Called automatically by queue-status-sms endpoint
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

    // Check if SMS already sent
    if (job.post_collection_sms_sent_at) {
      return NextResponse.json({
        success: true,
        message: 'Post-collection SMS already sent',
        alreadySent: true
      })
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

    // Calculate scheduled time
    const scheduledTime = calculateScheduledTime()

    // Update job with scheduled time for both SMS and email
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        post_collection_sms_scheduled_at: scheduledTime.toISOString(),
        post_collection_email_scheduled_at: scheduledTime.toISOString()
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error scheduling post-collection SMS:', updateError)
      return NextResponse.json(
        { error: 'Failed to schedule SMS' },
        { status: 500 }
      )
    }

    // Log event
    await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Post-collection notifications (SMS + Email) scheduled for ${scheduledTime.toLocaleString()}`
      })

    console.log(`Post-collection notifications scheduled for job ${job.job_ref} at ${scheduledTime.toISOString()}`)

    return NextResponse.json({
      success: true,
      scheduledAt: scheduledTime.toISOString(),
      message: 'Post-collection notifications (SMS + Email) scheduled'
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
 * Calculate when to send post-collection SMS with randomized delay
 * GUARDRAILS: Only schedule between 8am-8pm
 * - If collected before 16:00, send 1-3 hours later (randomized)
 * - If collected after 16:00, send at 10:00-12:00 next day (randomized)
 * - If scheduled time would be outside 8am-8pm, adjust to next available window
 * This prevents all review requests from going out at exactly the same time
 */
function calculateScheduledTime(): Date {
  const now = new Date()
  const currentHour = now.getHours()

  let scheduledTime: Date

  if (currentHour < 16) {
    // Send 1-3 hours from now (randomized)
    const minDelay = 60 * 60 * 1000 // 1 hour in ms
    const maxDelay = 3 * 60 * 60 * 1000 // 3 hours in ms
    const randomDelay = minDelay + Math.random() * (maxDelay - minDelay)
    scheduledTime = new Date(now.getTime() + randomDelay)
  } else {
    // Send at 10:00-12:00 next day (randomized)
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const randomHour = 10 + Math.floor(Math.random() * 2) // 10 or 11
    const randomMinute = Math.floor(Math.random() * 60) // 0-59
    tomorrow.setHours(randomHour, randomMinute, 0, 0)
    scheduledTime = tomorrow
  }

  // GUARDRAIL: Ensure scheduled time is within allowed hours (8am-8pm)
  const scheduledHour = scheduledTime.getHours()
  
  if (scheduledHour < 8) {
    // Too early - move to 8am same day
    scheduledTime.setHours(8, 0, 0, 0)
  } else if (scheduledHour >= 20) {
    // Too late - move to 10am next day
    scheduledTime.setDate(scheduledTime.getDate() + 1)
    scheduledTime.setHours(10, 0, 0, 0)
  }

  return scheduledTime
}
