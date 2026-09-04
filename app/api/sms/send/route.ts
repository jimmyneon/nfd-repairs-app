import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry, sendViaMacroDroid } from '@/lib/resilience'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    let smsLog
    let sms_log_id

    // Try to get sms_log_id from request body (optional)
    try {
      const body = await request.json()
      sms_log_id = body?.sms_log_id
    } catch {
      // No body provided, that's fine
    }

    if (sms_log_id) {
      // Send specific SMS
      const { data, error: fetchError } = await supabase
        .from('sms_logs')
        .select('*, jobs(customer_phone)')
        .eq('id', sms_log_id)
        .single()

      if (fetchError || !data) {
        return NextResponse.json(
          { error: 'SMS log not found' },
          { status: 404 }
        )
      }
      smsLog = data
    } else {
      // Send all PENDING SMS
      const { data: pendingSms, error: fetchError } = await supabase
        .from('sms_logs')
        .select('*, jobs(customer_phone)')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(10)

      if (fetchError || !pendingSms || pendingSms.length === 0) {
        return NextResponse.json(
          { success: true, message: 'No pending SMS to send' }
        )
      }

      // Send the first pending SMS
      smsLog = pendingSms[0]
      sms_log_id = smsLog.id
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL

    console.log('=== SMS SEND DEBUG ===')
    console.log('SMS Log ID:', sms_log_id)
    console.log('Phone:', smsLog.jobs?.customer_phone)
    console.log('Message preview:', smsLog.body_rendered?.substring(0, 50) + '...')
    console.log('Webhook URL configured:', !!webhookUrl)
    console.log('Webhook URL:', webhookUrl ? webhookUrl.substring(0, 40) + '...' : 'NOT SET')

    if (!webhookUrl) {
      console.error('MacroDroid webhook not configured')
      await supabase
        .from('sms_logs')
        .update({ 
          status: 'FAILED',
          error_message: 'MacroDroid webhook not configured'
        })
        .eq('id', sms_log_id)

      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 500 }
      )
    }

    // Guard: don't send empty/null message to MacroDroid (causes MacroDroid failures)
    if (!smsLog.body_rendered || !smsLog.body_rendered.trim()) {
      console.error(`SMS body_rendered is empty for sms_log ${sms_log_id} - not sending to MacroDroid`)
      await supabase
        .from('sms_logs')
        .update({ 
          status: 'FAILED',
          error_message: 'SMS body is empty - template may be missing or malformed'
        })
        .eq('id', sms_log_id)

      return NextResponse.json(
        { error: 'SMS body is empty - not sending to MacroDroid' },
        { status: 500 }
      )
    }

    const smsPayload = {
      phone: smsLog.jobs.customer_phone,
      message: smsLog.body_rendered,
    }

    console.log('Sending to MacroDroid webhook...')

    const result = await sendViaMacroDroid(webhookUrl, smsLog.jobs.customer_phone, smsLog.body_rendered)

    console.log('MacroDroid response:', result.status, result.ok)

    if (result.ok) {
      console.log('✅ SMS sent successfully via MacroDroid, response:', result.body.substring(0, 200))
      await supabaseRetry(() =>
        supabase
          .from('sms_logs')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
            // Store the MacroDroid response body for diagnostics
            error_message: `macrodroid_${result.status}:${result.body.substring(0, 200)}`,
          })
          .eq('id', sms_log_id)
      )

      return NextResponse.json({ success: true, macrodroid_response: result.body.substring(0, 200) })
    } else {
      console.error('❌ MacroDroid webhook failed:', result.body)

      // Keep status as PENDING (not FAILED) so the drain cron retries it.
      // Only mark FAILED if MacroDroid explicitly rejected it (4xx).
      const isRejection = result.status >= 400 && result.status < 500
      const newStatus = isRejection ? 'FAILED' : 'PENDING'

      await supabaseRetry(() =>
        supabase
          .from('sms_logs')
          .update({
            status: newStatus,
            error_message: result.body.substring(0, 500),
          })
          .eq('id', sms_log_id)
      )

      // Increment retry_count for tracking
      if (newStatus === 'PENDING') {
        await supabaseRetry(() => supabase.rpc('increment_retry_count', { sms_id: sms_log_id }))
      }

      return NextResponse.json(
        { error: 'Failed to send SMS', details: result.body },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error sending SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
