import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/email/send-link
 * Send a short email (usually a link) on behalf of an authorised backend
 * such as AI Desk. Bearer CRON_SECRET or staff session.
 * Body: { email: string, message: string, subject?: string }
 */
export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const { email, subject, message } = await request.json()

    const to = typeof email === 'string' ? email.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: 'a valid email address is required' },
        { status: 400 }
      )
    }

    if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
      return NextResponse.json(
        { error: 'message is required (max 2000 chars)' },
        { status: 400 }
      )
    }

    const safeSubject =
      typeof subject === 'string' && subject.trim() && subject.length <= 120
        ? subject.trim()
        : 'New Forest Device Repairs'

    const body = message.trim()
    const html = `<p>${body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')}</p>`

    const result = await sendEmail(to, safeSubject, html, body)
    if (!result?.success) {
      console.error('Email send failed:', result?.error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in email send-link:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
