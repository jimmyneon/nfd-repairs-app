import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry, sendSms, isWithinUKSendingHours } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'

// Allow up to 5 minutes for draining large queues
export const maxDuration = 300

/**
 * GET /api/sms/send-all
 * Cron endpoint - drains ALL pending SMS from sms_logs queue.
 *
 * Unlike /api/sms/send (which sends one at a time), this endpoint loops
 * through all PENDING rows and sends them with a delay between each to
 * respect MacroDroid rate limits.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header.
 *
 * Safety guards:
 * - Skips SMS with empty body (marks FAILED)
 * - Respects 8am-8pm sending window (configurable via skip_hours_check)
 * - 3-second delay between sends to avoid MacroDroid rate limiting
 * - Caps at 50 per run to avoid timeout
 */
export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  try {
    const supabase = createServiceClient()

    // Check that at least one SMS transport is configured.
    // The sendSms() helper picks relay if RELAY_* is set, else MacroDroid.
    const hasRelay = process.env.RELAY_URL && process.env.RELAY_API_KEY
    const hasMacroDroid = process.env.MACRODROID_WEBHOOK_URL
    if (!hasRelay && !hasMacroDroid) {
      console.error('No SMS transport configured (RELAY_* or MACRODROID_WEBHOOK_URL)')
      return NextResponse.json(
        { error: 'SMS transport not configured' },
        { status: 500 }
      )
    }

    // Check sending hours (8am-8pm UK time) unless explicitly skipped
    const skipHoursCheck = request.nextUrl.searchParams.get('skip_hours_check') === 'true'
    if (!skipHoursCheck) {
      if (!isWithinUKSendingHours()) {
        return NextResponse.json({
          success: true,
          message: 'Outside allowed sending hours (8am-8pm)',
          sent: 0,
          skipped: true,
        })
      }
    }

    // Fetch all PENDING SMS plus FAILED SMS older than 1 hour (for retry).
    // The 1-hour delay gives MacroDroid time to recover if it was down.
    // Skip messages that have been retried 10+ times (dead-letter).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: pendingRows, error: pendingError } = await supabase
      .from('sms_logs')
      .select('*, jobs(customer_phone)')
      .eq('status', 'PENDING')
      .lt('retry_count', 10)
      .order('created_at', { ascending: true })
      .limit(50)

    const { data: failedRows, error: failedError } = await supabase
      .from('sms_logs')
      .select('*, jobs(customer_phone)')
      .eq('status', 'FAILED')
      .lt('created_at', oneHourAgo)
      .lt('retry_count', 10)
      .order('created_at', { ascending: true })
      .limit(20)

    const fetchError = pendingError || failedError
    const pendingSms = [
      ...(pendingRows || []),
      ...(failedRows || []),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0, 50)

    if (fetchError) {
      console.error('Failed to fetch pending SMS:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch pending SMS', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!pendingSms || pendingSms.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending SMS to send',
        sent: 0,
      })
    }

    console.log(`📤 Draining ${pendingSms.length} pending SMS from queue`)

    const results: any[] = []
    let sentCount = 0
    let failedCount = 0

    for (let i = 0; i < pendingSms.length; i++) {
      const smsLog = pendingSms[i]

      // Dead-letter: if retry_count >= 10, mark as permanently failed
      if ((smsLog.retry_count || 0) >= 10) {
        console.error(`SMS ${smsLog.id} has been retried 10+ times - marking as DEAD_LETTER`)
        await supabaseRetry(() =>
          supabase
            .from('sms_logs')
            .update({
              status: 'FAILED',
              error_message: `Dead-letter: failed after ${smsLog.retry_count} retries`,
            })
            .eq('id', smsLog.id)
        )
        failedCount++
        results.push({ id: smsLog.id, status: 'DEAD_LETTER', retries: smsLog.retry_count })
        continue
      }

      // Guard: skip empty SMS
      if (!smsLog.body_rendered || !smsLog.body_rendered.trim()) {
        console.error(`SMS body_rendered is empty for sms_log ${smsLog.id} - marking FAILED`)
        await supabase
          .from('sms_logs')
          .update({
            status: 'FAILED',
            error_message: 'SMS body is empty - template may be missing or malformed',
          })
          .eq('id', smsLog.id)
        failedCount++
        results.push({ id: smsLog.id, status: 'FAILED', reason: 'empty body' })
        continue
      }

      // Guard: skip if no phone number
      if (!smsLog.jobs?.customer_phone) {
        console.error(`No customer_phone for sms_log ${smsLog.id} - marking FAILED`)
        await supabase
          .from('sms_logs')
          .update({
            status: 'FAILED',
            error_message: 'No customer phone number on job',
          })
          .eq('id', smsLog.id)
        failedCount++
        results.push({ id: smsLog.id, status: 'FAILED', reason: 'no phone' })
        continue
      }

      try {
        console.log(`Sending SMS ${i + 1}/${pendingSms.length} - log ${smsLog.id} to ${smsLog.jobs.customer_phone}`)

        const smsResult = await sendSms(smsLog.jobs.customer_phone, smsLog.body_rendered)

        if (smsResult.ok) {
          if (smsResult.queued && smsResult.relayMessageId) {
            // Relay transport: queued, not yet sent. Store relay message_id
            // for the relay-poll cron to sync status later.
            await supabaseRetry(() =>
              supabase
                .from('sms_logs')
                .update({
                  status: 'PENDING',
                  error_message: `relay_message_id:${smsResult.relayMessageId}`,
                })
                .eq('id', smsLog.id)
            )
            sentCount++
            results.push({ id: smsLog.id, status: 'QUEUED', relay_message_id: smsResult.relayMessageId })
          } else {
            // MacroDroid transport: fire-and-forget, treat as sent
            await supabaseRetry(() =>
              supabase
                .from('sms_logs')
                .update({
                  status: 'SENT',
                  sent_at: new Date().toISOString(),
                })
                .eq('id', smsLog.id)
            )
            sentCount++
            results.push({ id: smsLog.id, status: 'SENT' })
          }
        } else {
          console.error(`MacroDroid webhook failed for sms_log ${smsLog.id}:`, smsResult.body)
          // Keep as PENDING for retry on next cron run, unless it was a 4xx rejection
          const isRejection = smsResult.status >= 400 && smsResult.status < 500
          const newStatus = isRejection ? 'FAILED' : 'PENDING'
          await supabaseRetry(() =>
            supabase
              .from('sms_logs')
              .update({
                status: newStatus,
                error_message: smsResult.body.substring(0, 500),
              })
              .eq('id', smsLog.id)
          )
          // Increment retry count
          await supabaseRetry(() => supabase.rpc('increment_retry_count', { sms_id: smsLog.id }))
          failedCount++
          results.push({ id: smsLog.id, status: newStatus, error: smsResult.body.substring(0, 200) })
        }
      } catch (err) {
        console.error(`Error sending sms_log ${smsLog.id}:`, err)
        // Keep as PENDING for retry — don't mark FAILED on network errors
        await supabaseRetry(() =>
          supabase
            .from('sms_logs')
            .update({
              status: 'PENDING',
              error_message: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('id', smsLog.id)
        )
        failedCount++
        results.push({ id: smsLog.id, status: 'PENDING', error: 'exception' })
      }

      // 3-second delay between sends to respect MacroDroid rate limits
      // (skip delay after the last one)
      if (i < pendingSms.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    console.log(`✅ Drain complete: ${sentCount} sent, ${failedCount} failed`)

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: pendingSms.length,
      results,
    })
  } catch (error) {
    console.error('Error in send-all SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
