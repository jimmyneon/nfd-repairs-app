import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms, supabaseRetry } from '@/lib/resilience'
import { shortTrackingLink } from '@/lib/utils'
import { getFirstName } from '@/lib/sms-template'
import { sendEmail } from '@/lib/email'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/public/walk-in/submit
 *
 * SECURITY:
 *  - No phone-number lookup. A previous "lookup by phone" mode returned an
 *    existing customer's name, email, device and fault details to anyone who
 *    supplied a phone number — that was an enumeration attack and has been
 *    removed. Resume now happens client-side via the tracking token stored in
 *    localStorage when the quick-intake job was first created.
 *  - Updating an existing job by job_id requires the matching `token`
 *    (tracking_token) that was issued when the job was created. A bare job_id
 *    supplied by the browser is NOT sufficient.
 *  - Rate limited per IP.
 *
 * Body: { customer_name, customer_phone, customer_email?, device_type, device_make,
 *         device_model, issue, description?, terms_accepted, job_id?, token? }
 *
 * Creates a new walk-in job OR updates an existing one (if job_id + token
 * provided and verified). Sends the RECEIVED SMS to the customer on completion.
 */
export async function POST(request: NextRequest) {
  // Rate limit: walk-in form submissions + auto-saves. Auto-save fires once
  // per device step, so 10/min is generous for a single customer while
  // throttling enumeration/abuse.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'walk-in:submit', 10)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 })
  }

  const supabase = getAdminClient()
  const body = await request.json().catch(() => ({}))

  // --- Submit mode: create or update a walk-in job ---
  const {
    customer_name,
    customer_phone,
    customer_email,
    device_type,
    device_make,
    device_model,
    issue,
    description,
    terms_accepted,
    job_id,
    token,
  } = body

  if (!customer_name || !customer_phone) {
    return NextResponse.json({ error: 'Name and phone number are required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // If job_id provided, update the existing job — but ONLY after verifying
  // the caller holds the LONG tracking token issued for that job. A bare
  // job_id is never trusted on its own, and the short_token (24-bit) is
  // never accepted as an authority for updates — it is a cosmetic redirect
  // only.
  if (job_id) {
    if (!token || typeof token !== 'string' || token.length < 10 || token.length > 64) {
      return NextResponse.json({ error: 'Authorisation token required to update a booking' }, { status: 403 })
    }

    const { data: existing, error: findErr } = await supabase
      .from('jobs')
      .select('id,job_ref,tracking_token,short_token')
      .eq('id', job_id)
      .eq('source', 'walk_in_self')
      .eq('tracking_token', token)
      .single()

    if (existing && !findErr) {
      const updateData: Record<string, any> = {
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        customer_email: customer_email || null,
        device_type: device_type || 'other',
        device_make: device_make || 'Unknown',
        device_model: device_model || 'Unknown',
        issue: issue || 'To be assessed',
        description: description || null,
        updated_at: now,
      }

      // If terms accepted, mark as complete
      if (terms_accepted) {
        updateData.terms_accepted = true
        updateData.terms_accepted_at = now
        updateData.onboarding_completed = true
        updateData.onboarding_completed_at = now
        updateData.device_in_shop = true
        updateData.status = 'RECEIVED'
        updateData.status_changed_at = now
      }

      const { error: updateErr } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', job_id)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
      }

      // Log event
      await supabase.from('job_events').insert({
        job_id: job_id,
        type: 'SYSTEM',
        message: terms_accepted
          ? 'Customer completed walk-in self-booking and accepted terms'
          : 'Customer updated walk-in form details',
      } as any)

      // If terms accepted, send SMS and notify staff
      if (terms_accepted) {
        await sendWalkInSms(supabase, job_id, existing.job_ref, existing.short_token || existing.tracking_token, customer_name, customer_phone, device_make || '', device_model || '')
        await sendWalkInEmail(supabase, job_id)

        await supabase.from('notifications').insert({
          type: 'NEW_JOB',
          title: 'Walk-in self-booking completed',
          body: `${customer_name} - ${device_make || ''} ${device_model || ''} - ${issue || 'Repair'}`,
          job_id: job_id,
          is_read: false,
        } as any)
      }

      return NextResponse.json({
        success: true,
        job_id: job_id,
        job_ref: existing.job_ref,
        tracking_token: existing.tracking_token,
        short_token: existing.short_token,
      })
    }

    // job_id was provided but the token did not match this job (or the job
    // is not a self-service walk-in). Do NOT fall through to create a new
    // job — the caller intended an update and must be denied.
    return NextResponse.json({ error: 'Invalid or expired authorisation token' }, { status: 403 })
  }

  // Create a new job
  const crypto = await import('crypto')
  const trackingToken = crypto.randomUUID()

  // Generate job ref
  const { count: jobCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })

  const jobRef = `NF-${String((jobCount || 0) + 1).padStart(5, '0')}`

  const jobData: Record<string, any> = {
    job_ref: jobRef,
    tracking_token: trackingToken,
    customer_name: customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: customer_email || null,
    device_type: device_type || 'other',
    device_make: device_make || 'Unknown',
    device_model: device_model || 'Unknown',
    issue: issue || 'To be assessed',
    description: description || null,
    type: 'repair',
    source: 'walk_in_self',
    quoted_price: 0,
    price_total: 0,
    requires_parts_order: false,
    parts_required: false,
    deposit_required: false,
    deposit_received: false,
    device_in_shop: terms_accepted ? true : false,
    status: 'RECEIVED',
    status_changed_at: now,
    terms_accepted: terms_accepted || false,
    terms_accepted_at: terms_accepted ? now : null,
    onboarding_completed: terms_accepted || false,
    onboarding_completed_at: terms_accepted ? now : null,
    quick_intake: !terms_accepted, // Mark as quick_intake if not completed
    marketing_opt_in: false,
  }

  const { data: newJob, error: createErr } = await supabase
    .from('jobs')
    .insert(jobData)
    .select('id,job_ref,tracking_token,short_token')
    .single()

  if (createErr || !newJob) {
    console.error('Walk-in job creation error:', createErr)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // Log event
  await supabase.from('job_events').insert({
    job_id: newJob.id,
    type: 'SYSTEM',
    message: terms_accepted
      ? 'Walk-in self-booking created and completed'
      : 'Walk-in self-booking started (quick intake)',
  } as any)

  if (terms_accepted) {
    // Send SMS to customer
    await sendWalkInSms(supabase, newJob.id, newJob.job_ref, newJob.short_token || trackingToken, customer_name, customer_phone, device_make || '', device_model || '')
    await sendWalkInEmail(supabase, newJob.id)

    // Notify staff
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'Walk-in self-booking completed',
      body: `${customer_name} - ${device_make || ''} ${device_model || ''} - ${issue || 'Repair'}`,
      job_id: newJob.id,
      is_read: false,
    } as any)
  }

  return NextResponse.json({
    success: true,
    job_id: newJob.id,
    job_ref: newJob.job_ref,
    tracking_token: newJob.tracking_token,
    short_token: newJob.short_token,
  })
}

async function sendWalkInSms(
  supabase: any,
  jobId: string,
  jobRef: string,
  shortToken: string | null,
  customerName: string,
  customerPhone: string,
  deviceMake: string,
  deviceModel: string
) {
  const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('[walk-in] MACRODROID_WEBHOOK_URL not set')
    return
  }

  const firstName = getFirstName(customerName)
  const trackingUrl = shortTrackingLink(shortToken || '')

  // Build device summary for template
  const deviceSummary = (deviceMake && deviceModel)
    ? `${deviceMake} ${deviceModel}`.trim()
    : (deviceMake || deviceModel || 'device')

  // Try to get the RECEIVED template from the database
  const { data: template } = await supabase
    .from('sms_templates')
    .select('body')
    .eq('key', 'RECEIVED')
    .eq('is_active', true)
    .single()

  let smsBody: string
  if (template?.body) {
    smsBody = template.body
      .replace(/\{first_name\}/g, firstName)
      .replace(/\{customer_name\}/g, customerName)
      .replace(/\{device_summary\}/g, deviceSummary)
      .replace(/\{device_make\}/g, deviceMake || '')
      .replace(/\{device_model\}/g, deviceModel || '')
      .replace(/\{tracking_link\}/g, trackingUrl)
      .replace(/\{job_ref\}/g, jobRef)
  } else {
    smsBody = `Hi ${firstName}! 👋\n\nYour ${deviceSummary} is now booked in with us 🔧\n\n🔗 Track your repair here:\n${trackingUrl}\n\nWe will text you with updates as it progresses.\n\nNFD Repairs`
  }

  try {
    const result = await sendSms(customerPhone, smsBody)
    await supabase.from('sms_logs').insert({
      job_id: jobId,
      template_key: 'RECEIVED',
      body_rendered: smsBody,
      status: result.ok ? (result.queued ? 'PENDING' : 'SENT') : 'FAILED',
      recipient_phone: customerPhone,
      error_message: result.ok && result.relayMessageId
        ? `relay_message_id:${result.relayMessageId}`
        : undefined,
    } as any)
  } catch (err) {
    console.error('Walk-in SMS error:', err)
  }
}

/**
 * Send a confirmation email to the customer (if they provided an email).
 * Uses the same email template as the main job creation flow.
 */
async function sendWalkInEmail(supabase: any, jobId: string) {
  try {
    const { data: job } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job || !job.customer_email) return

    const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)
    const emailTemplate = generateEmbeddedJobEmail(
      {
        job,
        trackingUrl,
        statusMessage: 'Your device is now booked in with us. We will keep you updated throughout the repair.',
        includePrice: false,
      },
      'JOB_CREATED'
    )

    // Log email
    const { data: emailLog }: any = await supabaseRetry(() =>
      supabase
        .from('email_logs')
        .insert({
          job_id: jobId,
          template_key: 'JOB_CREATED',
          subject: emailTemplate.subject,
          body_html: emailTemplate.html,
          body_text: emailTemplate.text,
          recipient_email: job.customer_email,
          status: 'PENDING',
        } as any)
        .select()
        .single()
    )

    const result = await sendEmail(
      job.customer_email,
      emailTemplate.subject,
      emailTemplate.html,
      emailTemplate.text
    )

    if (result.success && emailLog) {
      await supabaseRetry(() =>
        supabase
          .from('email_logs')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
            resend_id: result.data?.id || null,
          })
          .eq('id', emailLog.id)
      )
    } else if (emailLog) {
      await supabaseRetry(() =>
        supabase
          .from('email_logs')
          .update({ status: 'FAILED', error_message: JSON.stringify(result.error) })
          .eq('id', emailLog.id)
      )
    }
  } catch (err) {
    console.error('Walk-in email error:', err)
  }
}
