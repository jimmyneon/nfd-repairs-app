import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink } from '@/lib/utils'

/**
 * GET /api/jobs/send-collection-reminders
 * Cron endpoint - runs daily to send collection reminders for uncollected devices
 *
 * Aligned to T&Cs: 30 days to collect, 90 days to disposal
 *
 * Reminder schedule (READY_TO_COLLECT):
 * - Day 3:  Reminder 1 (friendly nudge)
 * - Day 10: Reminder 2 (mention 30-day timeframe)
 * - Day 15: Reminder 3 (warning about storage transition)
 * - Day 25: Reminder 4 (final pre-storage reminder)
 * - Day 30: Auto-move to IN_STORAGE
 *
 * Reminder schedule (IN_STORAGE):
 * - Day 60: Reminder 5 (in storage, mention 90-day disposal)
 * - Day 85: Reminder 6 (final notice before disposal)
 * - Day 90: Flag for disposal
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify cron secret
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check sending hours (8am-8pm)
    const hour = new Date().getHours()
    if (hour < 8 || hour >= 20) {
      return NextResponse.json({
        success: true,
        message: 'Outside allowed sending hours (8am-8pm)',
        count: 0,
        skipped: true,
      })
    }

    // Fetch admin settings for links
    const { data: hoursSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'opening_hours_link')
      .single()

    const hoursLink = hoursSetting?.value || shortHoursLink()

    // Fetch all READY_TO_COLLECT and IN_STORAGE jobs
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .in('status', ['READY_TO_COLLECT', 'IN_STORAGE'])
      .order('status_changed_at', { ascending: true })

    if (error) {
      console.error('Error fetching jobs for reminders:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, message: 'No jobs needing reminders', count: 0 })
    }

    const now = new Date()
    const results: any[] = []
    let reminderCount = 0
    let storageMovedCount = 0
    let disposalFlaggedCount = 0

    for (const job of jobs) {
      // Calculate days in current status (use status_changed_at, fall back to created_at)
      const statusDate = job.status_changed_at || job.created_at
      if (!statusDate) continue

      const daysInStatus = Math.floor(
        (now.getTime() - new Date(statusDate).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Determine which reminder to send (if any)
      let reminderNumber: 1 | 2 | 3 | 4 | 5 | 6 | null = null
      let templateKey = ''

      if (job.status === 'READY_TO_COLLECT') {
        if (daysInStatus >= 3 && daysInStatus < 10 && !job.collection_reminder_1_sent_at) {
          reminderNumber = 1
          templateKey = 'COLLECTION_REMINDER_1'
        } else if (daysInStatus >= 10 && daysInStatus < 15 && !job.collection_reminder_2_sent_at) {
          reminderNumber = 2
          templateKey = 'COLLECTION_REMINDER_2'
        } else if (daysInStatus >= 15 && daysInStatus < 25 && !job.collection_reminder_3_sent_at) {
          reminderNumber = 3
          templateKey = 'COLLECTION_REMINDER_3'
        } else if (daysInStatus >= 25 && daysInStatus < 30 && !job.collection_reminder_4_sent_at) {
          reminderNumber = 4
          templateKey = 'COLLECTION_REMINDER_4'
        }
      } else if (job.status === 'IN_STORAGE') {
        if (daysInStatus >= 60 && daysInStatus < 85 && !job.collection_reminder_5_sent_at) {
          reminderNumber = 5
          templateKey = 'COLLECTION_REMINDER_5'
        } else if (daysInStatus >= 85 && daysInStatus < 90 && !job.collection_reminder_6_sent_at) {
          reminderNumber = 6
          templateKey = 'COLLECTION_REMINDER_6'
        }
      }

      // Auto-move to IN_STORAGE after 30 days in READY_TO_COLLECT
      if (daysInStatus >= 30 && job.status === 'READY_TO_COLLECT') {
        await supabase
          .from('jobs')
          .update({
            status: 'IN_STORAGE',
            status_changed_at: now.toISOString(),
            storage_moved_at: now.toISOString(),
          })
          .eq('id', job.id)

        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: `Device automatically moved to long-term storage after ${daysInStatus} days in Ready to Collect`,
        })

        storageMovedCount++
        results.push({
          jobRef: job.job_ref,
          action: 'moved_to_storage',
          daysInStatus,
        })

        continue
      }

      // Flag for disposal after 90 days in IN_STORAGE
      if (daysInStatus >= 90 && job.status === 'IN_STORAGE' && !job.disposal_flagged_at) {
        await supabase
          .from('jobs')
          .update({
            disposal_flagged_at: now.toISOString(),
          })
          .eq('id', job.id)

        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: `Device flagged for disposal/recycling after ${daysInStatus} days (per T&Cs: 90-day limit)`,
        })

        disposalFlaggedCount++
        results.push({
          jobRef: job.job_ref,
          action: 'flagged_for_disposal',
          daysInStatus,
        })

        continue
      }

      if (!reminderNumber) continue

      // Skip sensitive/awkward customers
      if (job.customer_flag === 'sensitive' || job.customer_flag === 'awkward') {
        console.log(`Skipping reminder for ${job.customer_flag} customer: ${job.job_ref}`)
        continue
      }

      // Get SMS template
      const { data: template } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', templateKey)
        .eq('is_active', true)
        .single()

      if (!template) {
        console.error(`Template not found: ${templateKey}`)
        continue
      }

      const trackingUrl = shortTrackingLink(job.tracking_token)

      let smsBody = renderSmsTemplate(template.body || '', {
        first_name: getFirstName(job.customer_name),
        customer_name: job.customer_name,
        device_make: job.device_make,
        device_model: job.device_model,
        device_summary: `${job.device_make} ${job.device_model}`.trim(),
        job_ref: job.job_ref,
        hours_link: hoursLink,
        tracking_link: trackingUrl,
      })

      // Add footer to all collection reminders
      if (smsBody && smsBody.trim()) {
        smsBody += "\n\nIf you've already collected your device, please ignore this message."
      }

      // Queue SMS
      const { data: smsLog, error: smsError } = await supabase
        .from('sms_logs')
        .insert({
          job_id: job.id,
          template_key: templateKey,
          body_rendered: smsBody,
          status: 'PENDING',
        })
        .select()
        .single()

      if (smsError) {
        console.error(`Failed to queue reminder SMS for ${job.job_ref}:`, smsError)
        results.push({ jobRef: job.job_ref, action: `reminder_${reminderNumber}`, success: false, error: 'Queue failed' })
        continue
      }

      // Guard: don't send empty SMS to MacroDroid
      if (!smsBody || !smsBody.trim()) {
        console.error(`Collection reminder SMS body is empty for job ${job.job_ref} - skipping`)
        await supabase.from('sms_logs').update({
          status: 'FAILED',
          error_message: 'SMS body is empty - template may be missing or malformed',
        }).eq('id', smsLog.id)
        results.push({ jobRef: job.job_ref, action: `reminder_${reminderNumber}`, success: false, error: 'Empty SMS body' })
        continue
      }

      // Send via MacroDroid
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        try {
          const smsResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: job.customer_phone,
              message: smsBody,
            }),
          })

          const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

          // Update SMS log
          await supabase
            .from('sms_logs')
            .update({ status: deliveryStatus, sent_at: now.toISOString() })
            .eq('id', smsLog.id)

          // Update reminder tracking field
          const updateField = `collection_reminder_${reminderNumber}_sent_at`
          await supabase
            .from('jobs')
            .update({ [updateField]: now.toISOString() })
            .eq('id', job.id)

          // Log event
          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'SYSTEM',
            message: `Collection reminder ${reminderNumber} sent (day ${daysInStatus}) - ${deliveryStatus}`,
          })

          reminderCount++
          results.push({
            jobRef: job.job_ref,
            action: `reminder_${reminderNumber}`,
            daysInStatus,
            deliveryStatus,
            success: true,
          })

          console.log(`Reminder ${reminderNumber} sent for ${job.job_ref} (day ${daysInStatus})`)

          // Wait 30 seconds between SMS sends
          if (reminderCount > 0) {
            await new Promise((resolve) => setTimeout(resolve, 30000))
          }
        } catch (err) {
          console.error(`Failed to send reminder SMS for ${job.job_ref}:`, err)
          results.push({ jobRef: job.job_ref, action: `reminder_${reminderNumber}`, success: false, error: 'Send failed' })
        }
      } else {
        console.error('MACRODROID_WEBHOOK_URL not configured')
      }
    }

    return NextResponse.json({
      success: true,
      remindersSent: reminderCount,
      storageMoved: storageMovedCount,
      disposalFlagged: disposalFlaggedCount,
      results,
    })
  } catch (error) {
    console.error('Error in send-collection-reminders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
