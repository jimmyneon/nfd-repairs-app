import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
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

    const smsResponse = await fetch(`${webhookUrl}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(smsPayload),
    })

    if (smsResponse.ok) {
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
      
      await supabase
        .from('sms_logs')
        .update({ 
          status: 'FAILED',
          error_message: errorText
        })
        .eq('id', sms_log_id)

      return NextResponse.json(
        { error: 'Failed to send SMS' },
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
