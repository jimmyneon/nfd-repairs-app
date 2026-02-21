import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    const smsPayload = {
      phone: smsLog.jobs.customer_phone,
      message: smsLog.body_rendered,
    }

    console.log('Sending to MacroDroid webhook...')
    console.log('Payload:', JSON.stringify(smsPayload, null, 2))

    const smsResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(smsPayload),
    })

    console.log('MacroDroid response status:', smsResponse.status)
    console.log('MacroDroid response ok:', smsResponse.ok)

    if (smsResponse.ok) {
      console.log('✅ SMS sent successfully via MacroDroid')
      await supabase
        .from('sms_logs')
        .update({ 
          status: 'SENT',
          sent_at: new Date().toISOString()
        })
        .eq('id', sms_log_id)

      return NextResponse.json({ success: true })
    } else {
      const errorText = await smsResponse.text()
      console.error('❌ MacroDroid webhook failed:', errorText)
      
      await supabase
        .from('sms_logs')
        .update({ 
          status: 'FAILED',
          error_message: errorText
        })
        .eq('id', sms_log_id)

      return NextResponse.json(
        { error: 'Failed to send SMS', details: errorText },
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
