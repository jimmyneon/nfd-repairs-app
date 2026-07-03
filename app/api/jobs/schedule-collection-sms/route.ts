import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/jobs/schedule-collection-sms
 * Called when job status changes to COLLECTED.
 *
 * 1. Sends review request SMS immediately (via POST to send-collection-sms)
 * 2. Schedules aftercare SMS for 2 days later
 * 3. Schedules post-collection email for 1-3 hours later (existing behaviour)
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

    // Check repair outcome
    if (job.repair_outcome === 'unrepaired' || job.repair_outcome === 'warranty_claim') {
      console.log(`Post-collection SMS skipped - repair outcome: ${job.repair_outcome} for ${job.job_ref}`)
      await supabase.from('job_events').insert({
        job_id: jobId, type: 'SYSTEM',
        message: `Post-collection SMS skipped - repair outcome: ${job.repair_outcome}`
      })
      return NextResponse.json({ success: true, message: `Skipped - repair outcome: ${job.repair_outcome}`, skipped: true })
    }

    // For partial repairs: skip review but still schedule aftercare
    const skipReviewOnly = job.repair_outcome === 'partial'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
    let reviewResult: any = { success: false, smsDeliveryStatus: 'skipped' }

    if (!skipReviewOnly) {
      // 1. Send review SMS immediately
      const reviewResponse = await fetch(`${appUrl}/api/jobs/send-collection-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      reviewResult = await reviewResponse.json()
      console.log(`Review SMS sent immediately for ${job.job_ref}:`, reviewResult.smsDeliveryStatus || reviewResult.message)
    } else {
      console.log(`Review SMS skipped for partial repair: ${job.job_ref}`)
      await supabase.from('job_events').insert({
        job_id: jobId, type: 'SYSTEM',
        message: 'Review SMS skipped - partial repair outcome'
      })
    }

    // 2. Schedule aftercare SMS for 3-5 days later (always, even for partial)
    const aftercareTime = calculateAftercareTime()
    await supabase.from('jobs').update({ aftercare_sms_scheduled_at: aftercareTime.toISOString() }).eq('id', jobId)

    // 3. Schedule email for 1-3 hours later (only if review was sent)
    if (!skipReviewOnly) {
      const emailTime = calculateEmailTime()
      await supabase.from('jobs').update({ post_collection_email_scheduled_at: emailTime.toISOString() }).eq('id', jobId)
    }

    await supabase.from('job_events').insert({
      job_id: jobId, type: 'SYSTEM',
      message: skipReviewOnly
        ? `Aftercare SMS scheduled for ${aftercareTime.toLocaleString()} (review skipped - partial)`
        : `Review SMS sent - ${reviewResult.smsDeliveryStatus || 'unknown'}. Aftercare scheduled for ${aftercareTime.toLocaleString()}`
    })

    return NextResponse.json({
      success: true,
      reviewSent: !skipReviewOnly && (reviewResult.success || false),
      reviewDeliveryStatus: reviewResult.smsDeliveryStatus,
      aftercareScheduledAt: aftercareTime.toISOString(),
      message: skipReviewOnly ? 'Review skipped (partial), aftercare scheduled' : 'Review SMS sent, aftercare scheduled',
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
 * Calculate when to send aftercare SMS (3-5 days from now, within 8am-8pm)
 */
function calculateAftercareTime(): Date {
  const now = new Date()
  const aftercare = new Date(now)

  // Randomize between 3-5 days
  const daysToAdd = 3 + Math.floor(Math.random() * 3) // 3, 4, or 5
  aftercare.setDate(aftercare.getDate() + daysToAdd)

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
