import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Check if already sent (unless manual override)
    if (job.post_collection_sms_sent_at && !manual) {
      return NextResponse.json({
        success: false,
        message: 'Post-collection SMS already sent',
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

    // Build SMS message (exact template as specified)
    const smsBody = `Hi ${firstName}, thanks again for choosing New Forest Device Repairs today.

Your repair is covered by our warranty, so if you notice anything you're unsure about just reply to this message and we'll sort it.

If everything's working well, we'd really appreciate a quick review — it helps other local customers know they can rely on us:

${googleReviewLink}

Thanks again for supporting a local business.`

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

    const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

    // Update job with sent status
    await supabase
      .from('jobs')
      .update({
        post_collection_sms_sent_at: new Date().toISOString(),
        post_collection_sms_delivery_status: deliveryStatus,
        post_collection_sms_body: smsBody
      })
      .eq('id', jobId)

    // Log event
    await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Post-collection SMS ${deliveryStatus.toLowerCase()}: Review request sent`
      })

    console.log(`Post-collection SMS ${deliveryStatus} for job ${job.job_ref}`)

    return NextResponse.json({
      success: smsResponse.ok,
      deliveryStatus,
      message: `Post-collection SMS ${deliveryStatus.toLowerCase()}`
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

    // Get all jobs with scheduled SMS that haven't been sent yet
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_phone')
      .not('post_collection_sms_scheduled_at', 'is', null)
      .is('post_collection_sms_sent_at', null)
      .lte('post_collection_sms_scheduled_at', new Date().toISOString())

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

    console.log(`Processing ${jobs.length} scheduled post-collection SMS`)

    // Send each SMS
    const results = []
    for (const job of jobs) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/api/jobs/send-collection-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id })
        })
        
        const result = await response.json()
        results.push({ jobRef: job.job_ref, ...result })
      } catch (err) {
        console.error(`Error sending SMS for job ${job.job_ref}:`, err)
        results.push({ jobRef: job.job_ref, success: false, error: 'Failed to send' })
      }
    }

    return NextResponse.json({
      success: true,
      count: jobs.length,
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
