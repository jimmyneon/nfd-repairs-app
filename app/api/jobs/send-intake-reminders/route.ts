import { NextRequest, NextResponse } from 'next/server'
import { getFirstName } from '@/lib/sms-template'
import { shortTrackingLink } from '@/lib/utils'
import { createServiceClient, sendViaMacroDroid, isWithinUKSendingHours } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'

export const maxDuration = 300

/**
 * GET /api/jobs/send-intake-reminders
 * Cron endpoint - runs daily to send reminders to customers who started a
 * walk-in/quick-intake form but haven't completed it.
 *
 * Reminder schedule:
 * - 24 hours after creation: one reminder SMS
 * - No further reminders (avoid pestering the customer)
 *
 * Only sends to jobs where:
 * - source = 'walk_in_self'
 * - quick_intake = true
 * - onboarding_completed = false
 * - intake_reminder_sent_at IS NULL
 * - created > 24 hours ago
 * - created < 7 days ago (don't remind very old ones)
 */
export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  try {
    const supabase = createServiceClient()

    if (!isWithinUKSendingHours()) {
      return NextResponse.json({
        success: true,
        message: 'Outside allowed sending hours (8am-8pm)',
        count: 0,
        skipped: true,
      })
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: 'SMS service not configured' }, { status: 500 })
    }

    // Find quick-intake jobs that haven't been completed and haven't had a reminder
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24h ago
    const maxAge = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago

    const { data: pendingJobs, error } = await supabase
      .from('jobs')
      .select('id,job_ref,customer_name,customer_phone,tracking_token,short_token,created_at')
      .eq('source', 'walk_in_self')
      .eq('quick_intake', true)
      .eq('onboarding_completed', false)
      .is('intake_reminder_sent_at', null)
      .lt('created_at', cutoff)
      .gt('created_at', maxAge)

    if (error) {
      console.error('Intake reminder query error:', error)
      return NextResponse.json({ error: 'Failed to query pending intakes' }, { status: 500 })
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No pending intake reminders' })
    }

    let sentCount = 0
    let failedCount = 0
    const now = new Date().toISOString()

    for (const job of pendingJobs) {
      if (!job.customer_phone) {
        // Can't send a reminder without a phone number — mark as reminded to avoid retrying
        await supabase.from('jobs').update({ intake_reminder_sent_at: now }).eq('id', job.id)
        continue
      }

      const firstName = getFirstName(job.customer_name)
      const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)

      const smsBody = `Hi ${firstName}! 👋\n\nJust a friendly reminder — you started checking in your device with us but haven't finished yet.\n\nTap here to complete it (takes 2 minutes):\n${trackingUrl}\n\nNFD Repairs`

      try {
        const result = await sendViaMacroDroid(webhookUrl, job.customer_phone, smsBody)

        if (result.ok) {
          sentCount++
          // Log the SMS
          await supabase.from('sms_logs').insert({
            job_id: job.id,
            phone: job.customer_phone,
            message: smsBody,
            status: 'SENT',
            template_key: 'INTAKE_REMINDER',
          } as any)
        } else {
          failedCount++
          console.error(`Intake reminder failed for job ${job.job_ref}:`, result.body)
        }
      } catch (err) {
        failedCount++
        console.error(`Intake reminder error for job ${job.job_ref}:`, err)
      }

      // Mark as reminded regardless of success (don't retry)
      await supabase.from('jobs').update({ intake_reminder_sent_at: now }).eq('id', job.id)
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: pendingJobs.length,
    })
  } catch (error) {
    console.error('Intake reminder error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
