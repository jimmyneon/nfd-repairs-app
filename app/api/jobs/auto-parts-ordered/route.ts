import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortTrackingLink } from '@/lib/utils'
import { sendSms, isSmsConfigured } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/auto-parts-ordered
 * Cron endpoint - runs every 15 minutes via pg_cron
 *
 * Two functions:
 * 1. Auto-change: Jobs created with requires_parts_order=true get a parts_ordered_at
 *    timestamp set 1 hour in the future. When that time passes and the job is still
 *    in RECEIVED or AWAITING_DEPOSIT status, auto-change to PARTS_ORDERED and send SMS.
 *
 * 2. Reassurance: Jobs that have been in PARTS_ORDERED status for 3+ days without
 *    a change get a reassurance SMS so customers don't lose faith and just show up.
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

    const now = new Date()
    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const results: any[] = []
    let autoChangedCount = 0
    let reassuranceSentCount = 0

    // Only staff can record a supplier order. This cron never converts payments into orders.

    // 2. REASSURANCE SMS: 3+ days in PARTS_ORDERED
    // ============================================
    // Check sending hours (8am-8pm) for reassurance SMS
    const hour = now.getHours()
    if (hour < 8 || hour >= 20) {
      return NextResponse.json({
        success: true,
        autoChanged: autoChangedCount,
        reassuranceSent: 0,
        message: 'Outside sending hours for reassurance SMS (8am-8pm)',
        results,
      })
    }

    // Find jobs in PARTS_ORDERED for 3+ days without a reassurance SMS sent
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    const { data: reassuranceJobs, error: reassuranceError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'PARTS_ORDERED')
      .is('parts_reassurance_sms_sent_at', null)
      .lte('status_changed_at', threeDaysAgo.toISOString())

    if (reassuranceError) {
      console.error('Error fetching reassurance jobs:', reassuranceError)
    }

    if (reassuranceJobs && reassuranceJobs.length > 0) {
      // Get reassurance template
      const { data: template } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'PARTS_REASSURANCE')
        .eq('is_active', true)
        .single()

      if (!template) {
        console.error('PARTS_REASSURANCE SMS template not found')
      } else {
        for (const job of reassuranceJobs) {
          // Skip sensitive/awkward customers
          if (job.customer_flag === 'sensitive' || job.customer_flag === 'awkward') {
            continue
          }

          const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)

          const smsBody = renderSmsTemplate(template.body || '', {
            first_name: getFirstName(job.customer_name),
            device_make: job.device_make,
            device_model: safeDeviceLabel(job.device_make, job.device_model),
            device_summary: safeDeviceLabel(job.device_make, job.device_model),
            job_ref: job.job_ref,
            tracking_link: trackingUrl,
          })

          // Guard: don't queue empty SMS
          if (!smsBody || !smsBody.trim()) {
            console.error(`Parts reassurance SMS body is empty for job ${job.job_ref} - skipping`)
            continue
          }

          // Queue SMS
          const { data: smsLog, error: smsError } = await supabase
            .from('sms_logs')
            .insert({
              job_id: job.id,
              template_key: 'PARTS_REASSURANCE',
              body_rendered: smsBody,
              status: 'PENDING',
            })
            .select()
            .single()

          if (smsError) {
            console.error(`Failed to queue reassurance SMS for ${job.job_ref}:`, smsError)
            continue
          }

          // Deliver by SMS when a phone exists. If the customer is email-only,
          // send the same reassurance content by email instead.
          const hasPhone = !!String(job.customer_phone || '').trim()
          const hasEmail = !!String(job.customer_email || '').trim()

          if (hasPhone && isSmsConfigured()) {
            try {
              const smsResponse = await sendSms(job.customer_phone, smsBody)
              const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

              await supabase
                .from('sms_logs')
                .update({ status: deliveryStatus, sent_at: deliveryStatus === 'SENT' ? now.toISOString() : null })
                .eq('id', smsLog.id)

              if (deliveryStatus === 'SENT') {
                await supabase
                  .from('jobs')
                  .update({ parts_reassurance_sms_sent_at: now.toISOString() })
                  .eq('id', job.id)
              }

              await supabase.from('job_events').insert({
                job_id: job.id,
                type: 'SYSTEM',
                message: `Parts reassurance SMS sent (parts still on order) - ${deliveryStatus}`,
              })

              if (deliveryStatus === 'SENT') reassuranceSentCount++
              results.push({
                jobRef: job.job_ref,
                action: 'parts_reassurance_sms',
                deliveryStatus,
              })

              console.log(`Reassurance SMS sent for ${job.job_ref}`)

              // Wait 30 seconds between SMS sends
              await new Promise((resolve) => setTimeout(resolve, 30000))
            } catch (err) {
              console.error(`Failed to send reassurance SMS for ${job.job_ref}:`, err)
            }
          } else if (!hasPhone && hasEmail) {
            try {
              // Remove the unused SMS log row because no SMS was attempted.
              await supabase.from('sms_logs').delete().eq('id', smsLog.id)

              const emailResult = await sendEmail(
                job.customer_email,
                `Parts update - ${job.job_ref}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${smsBody}</p></div>`,
                smsBody
              )
              const deliveryStatus = emailResult.success ? 'SENT' : 'FAILED'

              await supabase.from('email_logs').insert({
                job_id: job.id,
                template_key: 'PARTS_REASSURANCE',
                recipient_email: job.customer_email,
                subject: `Parts update - ${job.job_ref}`,
                body_text: smsBody,
                body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${smsBody}</p></div>`,
                status: deliveryStatus,
                sent_at: deliveryStatus === 'SENT' ? now.toISOString() : null,
              })

              if (deliveryStatus === 'SENT') {
                await supabase
                  .from('jobs')
                  .update({ parts_reassurance_sms_sent_at: now.toISOString() })
                  .eq('id', job.id)
                reassuranceSentCount++
              }

              await supabase.from('job_events').insert({
                job_id: job.id,
                type: 'SYSTEM',
                message: `Parts reassurance email sent (parts still on order) - ${deliveryStatus}`,
              })

              results.push({
                jobRef: job.job_ref,
                action: 'parts_reassurance_email',
                deliveryStatus,
              })
            } catch (err) {
              console.error(`Failed to send reassurance email for ${job.job_ref}:`, err)
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      autoChanged: autoChangedCount,
      reassuranceSent: reassuranceSentCount,
      results,
    })
  } catch (error) {
    console.error('Error in auto-parts-ordered:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

