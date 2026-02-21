import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { sms_log_id } = await request.json()

    if (!sms_log_id) {
      return NextResponse.json(
        { error: 'SMS log ID required' },
        { status: 400 }
      )
    }

    const { data: smsLog, error: fetchError } = await supabase
      .from('sms_logs')
      .select('*, jobs(customer_phone)')
      .eq('id', sms_log_id)
      .single()

    if (fetchError || !smsLog) {
      return NextResponse.json(
        { error: 'SMS log not found' },
        { status: 404 }
      )
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
