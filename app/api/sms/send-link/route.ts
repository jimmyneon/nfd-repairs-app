import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sendSms, isSmsConfigured } from '@/lib/resilience'

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

    // Normalise + validate UK mobile
    let normalised = typeof phone === 'string' ? phone.trim().replace(/\s+/g, '') : ''
    if (normalised.startsWith('07')) {
      normalised = '+44' + normalised.substring(1)
    } else if (normalised.startsWith('7') && !normalised.startsWith('+')) {
      normalised = '+44' + normalised
    }
    if (!/^\+447\d{9}$/.test(normalised)) {
      return NextResponse.json(
        { error: 'a valid UK mobile number is required' },
        { status: 400 }
      )
    }

    if (!isSmsConfigured()) {
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 500 }
      )
    }

    const body = message.trim()
    const smsResponse = await sendSms(normalised, body)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from('sms_logs').insert({
      template_key: 'AI_DESK_LINK',
      body_rendered: body,
      status: smsResponse.ok ? (smsResponse.queued ? 'PENDING' : 'SENT') : 'FAILED',
      sent_at: smsResponse.ok && !smsResponse.queued ? new Date().toISOString() : null,
      error_message: smsResponse.relayMessageId
        ? `relay_message_id:${smsResponse.relayMessageId}`
        : smsResponse.ok
          ? undefined
          : smsResponse.body.substring(0, 500),
    } as any)

    if (!smsResponse.ok) {
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 502 })
    }

    return NextResponse.json({ success: true, queued: !!smsResponse.queued })
  } catch (error) {
    console.error('Error in send-link:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
