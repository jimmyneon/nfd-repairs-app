import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendViaMacroDroid } from '@/lib/resilience'
import { shortTrackingLink } from '@/lib/utils'
import { getFirstName } from '@/lib/sms-template'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function normalisePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^0/, '44')
}

/**
 * POST /api/public/walk-in/lookup
 * Body: { phone: string }
 *
 * Looks for an existing incomplete walk-in job for this phone number.
 * Returns the job data if found, so the form can pre-fill.
 *
 * POST /api/public/walk-in/submit
 * Body: { customer_name, customer_phone, customer_email?, device_type, device_make,
 *         device_model, issue, description?, terms_accepted, job_id? }
 *
 * Creates a new walk-in job OR updates an existing one (if job_id provided).
 * Sends the RECEIVED SMS to the customer.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient()
  const body = await request.json().catch(() => ({}))

  // --- Lookup mode: find existing incomplete job by phone ---
  if (body.lookup === true && body.phone) {
    const phone = normalisePhone(String(body.phone).trim())
    const phoneVariants = [body.phone.trim(), phone, '0' + phone.slice(2)]

    const { data: jobs } = await supabase
      .from('jobs')
      .select('id,job_ref,customer_name,customer_phone,customer_email,device_type,device_make,device_model,issue,description,tracking_token,short_token,quick_intake,onboarding_completed,source,status')
      .eq('source', 'walk_in_self')
      .eq('quick_intake', true)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(10)

    // Match by phone (try variants)
    const match = (jobs || []).find((j: any) =>
      phoneVariants.some(p => j.customer_phone?.replace(/\s+/g, '') === p.replace(/\s+/g, ''))
    )

    if (match) {
      return NextResponse.json({
        found: true,
        job: {
          id: match.id,
          job_ref: match.job_ref,
          customer_name: match.customer_name,
          customer_phone: match.customer_phone,
          customer_email: match.customer_email,
          device_type: match.device_type,
          device_make: match.device_make,
          device_model: match.device_model,
          issue: match.issue,
          description: match.description,
        },
      })
    }

    return NextResponse.json({ found: false })
  }

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
  } = body

  if (!customer_name || !customer_phone) {
    return NextResponse.json({ error: 'Name and phone number are required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // If job_id provided, update the existing job
  if (job_id) {
    const { data: existing, error: findErr } = await supabase
      .from('jobs')
      .select('id,job_ref,tracking_token,short_token')
      .eq('id', job_id)
      .eq('source', 'walk_in_self')
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
        await sendWalkInSms(supabase, existing.job_ref, existing.short_token || existing.tracking_token, customer_name, customer_phone)

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
    await sendWalkInSms(supabase, newJob.job_ref, newJob.short_token || trackingToken, customer_name, customer_phone)

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
  jobRef: string,
  shortToken: string | null,
  customerName: string,
  customerPhone: string
) {
  const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
  if (!webhookUrl) return

  const firstName = getFirstName(customerName)
  const trackingUrl = shortTrackingLink(shortToken || '')

  // Try to get the RECEIVED template from the database
  const { data: template } = await supabase
    .from('sms_templates')
    .select('body')
    .eq('key', 'RECEIVED')
    .eq('is_active', true)
    .single()

  let smsBody: string
  if (template?.body) {
    // Simple template rendering
    smsBody = template.body
      .replace(/\{first_name\}/g, firstName)
      .replace(/\{customer_name\}/g, customerName)
      .replace(/\{tracking_link\}/g, trackingUrl)
      .replace(/\{job_ref\}/g, jobRef)
  } else {
    smsBody = `Hi ${firstName}! 👋\n\nYour device is now booked in with us 🔧\n\n🔗 Track your repair here:\n${trackingUrl}\n\nWe will text you with updates as it progresses.\n\nNFD Repairs`
  }

  try {
    const result = await sendViaMacroDroid(webhookUrl, customerPhone, smsBody)
    await supabase.from('sms_logs').insert({
      phone: customerPhone,
      message: smsBody,
      status: result.ok ? 'SENT' : 'FAILED',
      template_key: 'RECEIVED',
    } as any)
  } catch (err) {
    console.error('Walk-in SMS error:', err)
  }
}
