import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortPasswordLink } from '@/lib/utils'
import { requireStaffUser } from '@/lib/api-auth'
import { sendSms, isSmsConfigured } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/password/request
 * Creates a password request record and sends an SMS to the customer
 * with a secure link to enter their device password.
 * Requires staff authentication.
 */
export async function POST(request: NextRequest) {
  try {
    // Require staff auth
    const { response: authResponse } = await requireStaffUser(request)
    if (authResponse) return authResponse

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, customer_phone, customer_email, device_make, device_model')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const hasPhone = !!String(job.customer_phone || '').trim()
    const hasEmail = !!String(job.customer_email || '').trim()
    if (!hasPhone && !hasEmail) {
      return NextResponse.json({ error: 'Customer has no phone number or email address' }, { status: 400 })
    }

    // Generate a secure random token (12 hex chars = 48 bits = 281 trillion combinations)
    // Short enough for SMS-friendly links, still impossible to brute-force with 24h expiry + rate limiting
    const token = randomBytes(6).toString('hex')

    // Create password request record
    const { data: passwordRequest, error: reqError } = await supabase
      .from('password_requests')
      .insert({
        job_id: jobId,
        token,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (reqError || !passwordRequest) {
      console.error('Failed to create password request:', reqError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    // Build the secure link
    const passwordLink = shortPasswordLink(token)

    // Fetch the PASSWORD_REQUEST template
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'PASSWORD_REQUEST')
      .eq('is_active', true)
      .single()

    const firstName = getFirstName(job.customer_name)
    const deviceModel = safeDeviceLabel(job.device_make, job.device_model)

    let smsBody: string
    if (template) {
      smsBody = renderSmsTemplate(template.body, {
        first_name: firstName,
        customer_name: job.customer_name,
        device_make: job.device_make || '',
        device_model: deviceModel,
        device_summary: deviceModel,
        password_link: passwordLink,
        job_ref: job.job_ref,
      })
    } else {
      smsBody = `Hi ${firstName}!\n\nTo complete your repair, we need your device passcode.\n\nPlease enter it securely using this link:\n${passwordLink}\n\nThis link expires in 24 hours.\n\nYour passcode is stored securely and deleted 7 days after collection.\n\nNFD Repairs`
    }

    const now = new Date().toISOString()
    let deliveryStatus = 'FAILED'
    let channel: 'sms' | 'email' = hasPhone ? 'sms' : 'email'

    if (hasPhone) {
      if (isSmsConfigured()) {
        try {
          const smsResponse = await sendSms(job.customer_phone, smsBody)
          deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'
        } catch (err) {
          console.error('MacroDroid send failed:', err)
        }
      }

      await supabase.from('sms_logs').insert({
        job_id: jobId,
        template_key: 'PASSWORD_REQUEST',
        body_rendered: smsBody,
        status: deliveryStatus,
        sent_at: deliveryStatus === 'SENT' ? now : null,
      })
    } else {
      const escapedBody = smsBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
      const subject = `Secure passcode request - ${job.job_ref}`
      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${escapedBody}</p></div>`
      const emailResult = await sendEmail(job.customer_email, subject, htmlBody, smsBody)
      deliveryStatus = emailResult.success ? 'SENT' : 'FAILED'

      await supabase.from('email_logs').insert({
        job_id: jobId,
        template_key: 'PASSWORD_REQUEST',
        recipient_email: job.customer_email,
        subject,
        body_text: smsBody,
        body_html: htmlBody,
        status: deliveryStatus,
        sent_at: deliveryStatus === 'SENT' ? now : null,
      })
    }

    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Password request ${channel} ${deliveryStatus}: secure link sent to customer`,
    })

    return NextResponse.json({
      success: deliveryStatus === 'SENT',
      deliveryStatus,
      channel,
    })
  } catch (error) {
    console.error('Error in password request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
