import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  try {
    // Verify cron secret
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      console.error('MACRODROID_WEBHOOK_URL not configured')
      return NextResponse.json(
        { error: 'SMS webhook not configured' },
        { status: 500 }
      )
    }

    // Check sending hours (8am-8pm) unless explicitly skipped
    const skipHoursCheck = request.nextUrl.searchParams.get('skip_hours_check') === 'true'
    if (!skipHoursCheck) {
      const hour = new Date().getHours()
      if (hour < 8 || hour >= 20) {
        return NextResponse.json({
          success: true,
          message: 'Outside allowed sending hours (8am-8pm)',
          sent: 0,
          skipped: true,
        })
      }
    }

    // Fetch all PENDING SMS, oldest first
    const { data: pendingSms, error: fetchError } = await supabase
      .from('sms_logs')
      .select('*, jobs(customer_phone)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(50)

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

        const smsResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: smsLog.jobs.customer_phone,
            message: smsLog.body_rendered,
          }),
        })

        if (smsResponse.ok) {
          await supabase
            .from('sms_logs')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
            })
            .eq('id', smsLog.id)
          sentCount++
          results.push({ id: smsLog.id, status: 'SENT' })
        } else {
          const errorText = await smsResponse.text()
          console.error(`MacroDroid webhook failed for sms_log ${smsLog.id}:`, errorText)
          await supabase
            .from('sms_logs')
            .update({
              status: 'FAILED',
              error_message: errorText.substring(0, 500),
            })
            .eq('id', smsLog.id)
          failedCount++
          results.push({ id: smsLog.id, status: 'FAILED', error: errorText.substring(0, 200) })
        }
      } catch (err) {
        console.error(`Error sending sms_log ${smsLog.id}:`, err)
        await supabase
          .from('sms_logs')
          .update({
            status: 'FAILED',
            error_message: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', smsLog.id)
        failedCount++
        results.push({ id: smsLog.id, status: 'FAILED', error: 'exception' })
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
