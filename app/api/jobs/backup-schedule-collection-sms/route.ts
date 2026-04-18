import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { secret } = await request.json()

    // Verify secret for security
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Find COLLECTED jobs that haven't been scheduled (and shouldn't be skipped)
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, job_ref')
      .eq('status', 'COLLECTED')
      .is('post_collection_sms_scheduled_at', null)
      .is('skip_review_request', false)
      .or('customer_flag.is.null,customer_flag.neq.sensitive,customer_flag.neq.awkward')

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: 'No jobs to schedule', count: 0 })
    }

    // Schedule each job
    const scheduledTime = new Date(Date.now() + 3 * 60 * 60 * 1000) // 3 hours from now
    const { error } = await supabase
      .from('jobs')
      .update({
        post_collection_sms_scheduled_at: scheduledTime.toISOString(),
        post_collection_email_scheduled_at: scheduledTime.toISOString()
      })
      .in('id', jobs.map(j => j.id))

    if (error) {
      console.error('Backup scheduling error:', error)
      return NextResponse.json({ error: 'Failed to schedule jobs' }, { status: 500 })
    }

    console.log(`Backup scheduled ${jobs.length} jobs:`, jobs.map(j => j.job_ref))
    return NextResponse.json({ 
      message: 'Backup scheduling completed', 
      count: jobs.length,
      jobs: jobs.map(j => j.job_ref)
    })
  } catch (error) {
    console.error('Backup scheduling error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
