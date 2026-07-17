import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

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

    // ============================================
    // 1. AUTO-CHANGE: RECEIVED → PARTS_ORDERED
    // ============================================
    // Find jobs where parts_ordered_at has passed and status is still RECEIVED or AWAITING_DEPOSIT
    const { data: pendingPartsJobs, error: pendingError } = await supabase
      .from('jobs')
      .select('*')
      .in('status', ['RECEIVED', 'AWAITING_DEPOSIT'])
      .not('parts_ordered_at', 'is', null)
      .lte('parts_ordered_at', now.toISOString())

    if (pendingError) {
      console.error('Error fetching pending parts jobs:', pendingError)
    }

    if (pendingPartsJobs && pendingPartsJobs.length > 0) {
      for (const job of pendingPartsJobs) {
        // Update status to PARTS_ORDERED
        await supabase
          .from('jobs')
          .update({
            status: 'PARTS_ORDERED',
            status_changed_at: now.toISOString(),
            parts_required: true,
          })
          .eq('id', job.id)

        // Log the status change event
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to Parts Ordered (auto)',
        })

        // Queue SMS notification
        try {
          await fetch(`${appUrl}/api/jobs/queue-status-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id, status: 'PARTS_ORDERED' }),
          })
        } catch (smsError) {
          console.error(`Failed to queue PARTS_ORDERED SMS for ${job.job_ref}:`, smsError)
        }

        // Send email if customer has email
        if (job.customer_email) {
          try {
            await fetch(`${appUrl}/api/email/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: job.id, type: 'STATUS_UPDATE' }),
            })
          } catch (emailError) {
            console.error(`Failed to send PARTS_ORDERED email for ${job.job_ref}:`, emailError)
          }
        }

        autoChangedCount++
        results.push({
          jobRef: job.job_ref,
          action: 'auto_parts_ordered',
        })

        console.log(`Auto-changed ${job.job_ref} to PARTS_ORDERED`)
      }
    }

    // ============================================
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

          const trackingUrl = `${appUrl}/t/${job.tracking_token}`

          const smsBody = renderSmsTemplate(template.body, {
            first_name: getFirstName(job.customer_name),
            device_make: job.device_make,
            device_model: job.device_model,
            job_ref: job.job_ref,
            tracking_link: trackingUrl,
          })

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

              await supabase
                .from('sms_logs')
                .update({ status: deliveryStatus, sent_at: now.toISOString() })
                .eq('id', smsLog.id)

              // Mark reassurance as sent
              await supabase
                .from('jobs')
                .update({ parts_reassurance_sms_sent_at: now.toISOString() })
                .eq('id', job.id)

              // Log event
              await supabase.from('job_events').insert({
                job_id: job.id,
                type: 'SYSTEM',
                message: `Parts reassurance SMS sent (parts still on order) - ${deliveryStatus}`,
              })

              reassuranceSentCount++
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
