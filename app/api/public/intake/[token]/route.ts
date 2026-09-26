import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const VALID_TOKEN = /^[a-zA-Z0-9-]{10,64}$/

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  // Rate limit: intake form loads + polling.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'intake:get', 20)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (!VALID_TOKEN.test(params.token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('jobs')
    // Select only the fields needed to prefill the customer's own form.
    // device_password is selected ONLY to compute has_device_password —
    // its value is never sent to the browser (see the explicit allowlist
    // in the response below). tracking_token and id are internal.
    .select('job_ref,customer_name,customer_email,device_type,device_make,device_model,issue,description,device_password,password_not_applicable,terms_accepted,onboarding_completed,is_warranty')
    .eq('tracking_token', params.token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  // Return ONLY the customer-safe prefill fields. Never echo device_password.
  return NextResponse.json({
    job: {
      job_ref: data.job_ref,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      device_type: data.device_type,
      device_make: data.device_make,
      device_model: data.device_model,
      issue: data.issue,
      description: data.description,
      password_not_applicable: data.password_not_applicable,
      has_device_password: Boolean(data.device_password),
      terms_accepted: data.terms_accepted,
      onboarding_completed: data.onboarding_completed,
      is_warranty: data.is_warranty,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  // Rate limit: intake form submissions.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'intake:patch', 10)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 })
  }

  if (!VALID_TOKEN.test(params.token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid form submission' }, { status: 400 })
  }

  if (body.terms_accepted !== true) {
    return NextResponse.json({ error: 'Please accept the repair terms before submitting' }, { status: 400 })
  }

  const text = (value: unknown, max: number) =>
    typeof value === 'string' ? value.trim().slice(0, max) : ''

  const notSure = body.not_sure === true
  const deviceType = text(body.device_type, 50) || 'other'
  const deviceMake = notSure ? 'To be assessed' : (text(body.device_make, 100) || 'To be assessed')
  const deviceModel = notSure ? 'To be assessed' : (text(body.device_model, 150) || 'To be assessed')
  const issue = notSure ? 'To be assessed' : (text(body.issue, 200) || 'To be assessed')
  const emailOptOut = body.email_opt_out === true
  const email = emailOptOut ? null : (text(body.customer_email, 254) || null)
  const passcodeChoice = body.passcode_choice
  const passwordNotApplicable = passcodeChoice === 'not_needed'
  const devicePassword = passcodeChoice === 'provided' ? text(body.device_password, 100) : null

  if (passcodeChoice === 'provided' && !devicePassword) {
    return NextResponse.json({ error: 'Enter the device passcode or choose another option' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id,job_ref,is_warranty,customer_email')
    .eq('tracking_token', params.token)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  if (!job.is_warranty && body.diagnostic_fee_acknowledged !== true) {
    return NextResponse.json({ error: 'Please acknowledge the diagnostic fee policy' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    device_type: deviceType,
    device_make: deviceMake,
    device_model: deviceModel,
    issue,
    description: text(body.description, 2000) || null,
    customer_email: email,
    terms_accepted: true,
    terms_accepted_at: now,
    marketing_opt_in: body.marketing_opt_in === true,
    marketing_opt_in_at: body.marketing_opt_in === true ? now : null,
    onboarding_completed: true,
    onboarding_completed_at: now,
  }

  // “Ask later” must preserve any passcode already held on the job.
  if (passcodeChoice === 'provided' || passcodeChoice === 'not_needed') {
    updateData.device_password = devicePassword
    updateData.password_not_applicable = passwordNotApplicable
  }

  const { error: updateError } = await supabase
    .from('jobs')
    .update(updateData as any)
    .eq('id', job.id)

  if (updateError) {
    console.error('Public intake update failed:', updateError)
    return NextResponse.json({ error: 'Unable to save your details. Please try again.' }, { status: 500 })
  }

  await supabase.from('job_events').insert({
    job_id: job.id,
    type: 'SYSTEM',
    message: `Customer completed intake and accepted repair terms${job.is_warranty ? '' : ' and diagnostic fee policy'}`,
  } as any)

  // Notify staff that the customer completed their intake form
  await supabase.from('notifications').insert({
    type: 'INTAKE_COMPLETED',
    title: 'Intake form completed',
    body: `${job.is_warranty ? 'Warranty' : 'Walk-in'}: customer finished their check-in form`,
    job_id: job.id,
    is_read: false,
  } as any)

  // If the customer just added an email that wasn't on the job before,
  // send the "Job Created" confirmation email so they get a record of the
  // booking (quick-intake jobs are created without an email).
  if (email && !job.customer_email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
      await fetch(`${appUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, type: 'JOB_CREATED' }),
      })
    } catch (err) {
      console.error('Failed to send post-intake email:', err)
    }
  }

  return NextResponse.json({ success: true, job_ref: job.job_ref })
}
