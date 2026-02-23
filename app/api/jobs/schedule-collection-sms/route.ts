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

    // Calculate scheduled time
    const scheduledTime = calculateScheduledTime()

    // Update job with scheduled time
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        post_collection_sms_scheduled_at: scheduledTime.toISOString()
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
        message: `Post-collection SMS scheduled for ${scheduledTime.toLocaleString()}`
      })

    console.log(`Post-collection SMS scheduled for job ${job.job_ref} at ${scheduledTime.toISOString()}`)

    return NextResponse.json({
      success: true,
      scheduledAt: scheduledTime.toISOString(),
      message: 'Post-collection SMS scheduled'
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
 * Calculate when to send post-collection SMS
 * - If collected before 16:00, send 3 hours later
 * - If collected after 16:00, send at 10:00 next day
 */
function calculateScheduledTime(): Date {
  const now = new Date()
  const currentHour = now.getHours()

  if (currentHour < 16) {
    // Send 3 hours from now
    const scheduledTime = new Date(now.getTime() + (3 * 60 * 60 * 1000))
    return scheduledTime
  } else {
    // Send at 10:00 next day
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    return tomorrow
  }
}
