import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/jobs/backup-schedule-collection-sms
 * Cron endpoint — runs daily to catch any COLLECTED/COMPLETED jobs
 * that were missed by the main schedule-collection-sms POST handler.
 * Verifies via Vercel Cron Authorization header.
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return await runBackupSchedule()
  } catch (error) {
    console.error('Backup scheduling error (GET):', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { secret } = await request.json()

    // Verify secret for security
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return await runBackupSchedule()
  } catch (error) {
    console.error('Backup scheduling error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function runBackupSchedule() {
    // Use service role key for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Find COLLECTED or COMPLETED jobs that haven't been scheduled (and shouldn't be skipped)
    // Include COMPLETED to catch jobs that were auto-closed before review was scheduled
    // Only look at jobs updated in the last 14 days to avoid scheduling very old jobs
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, job_ref, repair_outcome')
      .in('status', ['COLLECTED', 'COMPLETED'])
      .is('post_collection_sms_scheduled_at', null)
      .is('post_collection_sms_sent_at', null)
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
      .or('repair_outcome.is.null,repair_outcome.eq.repaired')
      .gte('updated_at', fourteenDaysAgo)

    if (!jobs || jobs.length === 0) {
      // Still check for aftercare jobs even if no review jobs need scheduling
      const aftercareTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
      const { data: aftercareJobsOnly } = await supabase
        .from('jobs')
        .select('id, job_ref')
        .in('status', ['COLLECTED', 'COMPLETED'])
        .is('aftercare_sms_scheduled_at', null)
        .is('aftercare_sms_sent_at', null)
        .not('post_collection_sms_sent_at', 'is', null)
        .is('skip_review_request', false)
        .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
        .or('repair_outcome.is.null,repair_outcome.eq.repaired')

      if (aftercareJobsOnly && aftercareJobsOnly.length > 0) {
        await supabase
          .from('jobs')
          .update({ aftercare_sms_scheduled_at: aftercareTime.toISOString() })
          .in('id', aftercareJobsOnly.map(j => j.id))
        console.log(`Backup scheduled ${aftercareJobsOnly.length} aftercare jobs (no review jobs needed)`)
      }

      // Also schedule review reminders for COLLECTED jobs that have review sent but no reminder scheduled
      const reviewReminderTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days from now
      const { data: reminderJobsOnly } = await supabase
        .from('jobs')
        .select('id, job_ref')
        .in('status', ['COLLECTED', 'COMPLETED'])
        .is('review_reminder_sms_scheduled_at', null)
        .is('review_reminder_sms_sent_at', null)
        .not('post_collection_sms_sent_at', 'is', null)
        .is('skip_review_request', false)
        .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
        .or('repair_outcome.is.null,repair_outcome.eq.repaired')

      let reminderCount = 0
      if (reminderJobsOnly && reminderJobsOnly.length > 0) {
        await supabase
          .from('jobs')
          .update({ review_reminder_sms_scheduled_at: reviewReminderTime.toISOString() })
          .in('id', reminderJobsOnly.map(j => j.id))
        reminderCount = reminderJobsOnly.length
        console.log(`Backup scheduled ${reminderCount} review reminder jobs`)
      }

      if ((aftercareJobsOnly && aftercareJobsOnly.length > 0) || reminderCount > 0) {
        return NextResponse.json({
          message: 'Aftercare/reminders only',
          reviewCount: 0,
          aftercareCount: aftercareJobsOnly?.length || 0,
          reviewReminderCount: reminderCount,
        })
      }

      return NextResponse.json({ message: 'No jobs to schedule', reviewCount: 0, aftercareCount: 0, reviewReminderCount: 0 })
    }

    // Schedule each job for 6pm evening (matching schedule-collection-sms behaviour)
    const scheduledTime = new Date()
    const hour = scheduledTime.getHours()
    if (hour >= 20) {
      scheduledTime.setDate(scheduledTime.getDate() + 1)
    }
    scheduledTime.setHours(18, 0, 0, 0)
    const { error } = await supabase
      .from('jobs')
      .update({
        post_collection_sms_scheduled_at: scheduledTime.toISOString(),
      })
      .in('id', jobs.map(j => j.id))

    if (error) {
      console.error('Backup scheduling error:', error)
      return NextResponse.json({ error: 'Failed to schedule jobs' }, { status: 500 })
    }

    // Also schedule aftercare for COLLECTED jobs that have review sent but no aftercare
    const aftercareTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    const { data: aftercareJobs } = await supabase
      .from('jobs')
      .select('id, job_ref')
      .in('status', ['COLLECTED', 'COMPLETED'])
      .is('aftercare_sms_scheduled_at', null)
      .is('aftercare_sms_sent_at', null)
      .not('post_collection_sms_sent_at', 'is', null)
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
      .or('repair_outcome.is.null,repair_outcome.eq.repaired')

    let aftercareCount = 0
    if (aftercareJobs && aftercareJobs.length > 0) {
      const { error: aftercareError } = await supabase
        .from('jobs')
        .update({
          aftercare_sms_scheduled_at: aftercareTime.toISOString(),
        })
        .in('id', aftercareJobs.map(j => j.id))

      if (!aftercareError) {
        aftercareCount = aftercareJobs.length
        console.log(`Backup scheduled ${aftercareCount} aftercare jobs:`, aftercareJobs.map(j => j.job_ref))
      }
    }

    // Also schedule review reminders for COLLECTED jobs that have review sent but no reminder
    const reviewReminderTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days from now
    const { data: reminderJobs } = await supabase
      .from('jobs')
      .select('id, job_ref')
      .in('status', ['COLLECTED', 'COMPLETED'])
      .is('review_reminder_sms_scheduled_at', null)
      .is('review_reminder_sms_sent_at', null)
      .not('post_collection_sms_sent_at', 'is', null)
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')
      .or('repair_outcome.is.null,repair_outcome.eq.repaired')

    let reminderCount = 0
    if (reminderJobs && reminderJobs.length > 0) {
      const { error: reminderError } = await supabase
        .from('jobs')
        .update({
          review_reminder_sms_scheduled_at: reviewReminderTime.toISOString(),
        })
        .in('id', reminderJobs.map(j => j.id))

      if (!reminderError) {
        reminderCount = reminderJobs.length
        console.log(`Backup scheduled ${reminderCount} review reminder jobs:`, reminderJobs.map(j => j.job_ref))
      }
    }

    console.log(`Backup scheduled ${jobs.length} review jobs:`, jobs.map(j => j.job_ref))
    return NextResponse.json({
      message: 'Backup scheduling completed',
      reviewCount: jobs.length,
      aftercareCount,
      reviewReminderCount: reminderCount,
      jobs: jobs.map(j => j.job_ref)
    })
}
