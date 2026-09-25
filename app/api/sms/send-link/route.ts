import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sendViaMacroDroid } from '@/lib/resilience'

/**
 * POST /api/sms/send-link
 * Send a short SMS (usually a link) to a UK mobile on behalf of an
 * authorised backend such as AI Desk. Bearer CRON_SECRET or staff session.
 * Body: { phone: string, message: string }
 */
export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const { phone, message } = await request.json()

    if (typeof message !== 'string' || !message.trim() || message.length > 480) {
      return NextResponse.json(
        { error: 'message is required (max 480 chars)' },
        { status: 400 }
      )
    }

    // Normalise phone number
    let normalisedPhone = typeof phone === 'string' ? phone.trim().replace(/\s+/g, '') : ''
    if (normalisedPhone.startsWith('07')) {
      normalisedPhone = '+44' + normalisedPhone.substring(1)
    } else if (normalisedPhone.startsWith('7') && !normalisedPhone.startsWith('+')) {
      normalisedPhone = '+44' + normalisedPhone
    }
    if (!/^\+447\d{9}$/.test(normalisedPhone)) {
      return NextResponse.json(
        { error: 'a valid UK mobile number is required' },
        { status: 400 }
      )
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      console.error('MACRODROID_WEBHOOK_URL not configured')
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 500 }
      )
    }

    const body = message.trim()
    const smsResponse = await sendViaMacroDroid(webhookUrl, normalisedPhone, body)

    // Log to sms_logs for audit trail
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from('sms_logs').insert({
      template_key: 'AI_DESK_LINK',
      body_rendered: body,
      status: smsResponse.ok ? 'SENT' : 'FAILED',
      sent_at: smsResponse.ok ? new Date().toISOString() : null,
      error_message: smsResponse.ok
        ? undefined
        : smsResponse.body.substring(0, 500),
    } as any)

    if (!smsResponse.ok) {
      console.error('SMS send failed:', smsResponse.body)
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in send-link:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
