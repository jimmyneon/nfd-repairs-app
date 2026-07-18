import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'
import { shortPasswordLink } from '@/lib/utils'

/**
 * POST /api/password/request
 * Creates a password request record and sends an SMS to the customer
 * with a secure link to enter their device password.
 */
export async function POST(request: NextRequest) {
  try {
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
      .select('id, job_ref, customer_name, customer_phone, device_make, device_model')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!job.customer_phone) {
      return NextResponse.json({ error: 'Customer has no phone number' }, { status: 400 })
    }

    // Generate a secure random token
    const token = randomBytes(32).toString('hex')

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
    const deviceModel = job.device_model || 'your device'

    let smsBody: string
    if (template) {
      smsBody = renderSmsTemplate(template.body, {
        first_name: firstName,
        customer_name: job.customer_name,
        device_make: job.device_make || '',
        device_model: deviceModel,
        password_link: passwordLink,
        job_ref: job.job_ref,
      })
    } else {
      smsBody = `Hi ${firstName}, to complete your repair we need your device passcode. Please enter it securely using this link:\n\n${passwordLink}\n\nThis link expires in 24 hours. Your passcode is stored securely and deleted 7 days after collection.\n\nMany thanks,\nNew Forest Device Repairs`
    }

    // Send SMS via MacroDroid
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    let smsStatus = 'FAILED'

    if (webhookUrl) {
      try {
        const smsResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: job.customer_phone,
            message: smsBody,
          }),
        })
        smsStatus = smsResponse.ok ? 'SENT' : 'FAILED'
      } catch (err) {
        console.error('MacroDroid send failed:', err)
      }
    }

    // Log SMS
    await supabase.from('sms_logs').insert({
      job_id: jobId,
      template_key: 'PASSWORD_REQUEST',
      body_rendered: smsBody,
      status: smsStatus,
      sent_at: smsStatus === 'SENT' ? new Date().toISOString() : null,
    })

    // Log job event
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Password request SMS ${smsStatus}: secure link sent to customer`,
    })

    return NextResponse.json({
      success: smsStatus === 'SENT',
      smsStatus,
      token,
    })
  } catch (error) {
    console.error('Error in password request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
