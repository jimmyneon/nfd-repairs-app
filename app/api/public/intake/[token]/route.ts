import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_TOKEN = /^[a-zA-Z0-9-]{10,64}$/

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  if (!VALID_TOKEN.test(params.token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('id,job_ref,customer_name,customer_email,device_type,device_make,device_model,issue,description,device_password,password_not_applicable,terms_accepted,onboarding_completed,is_warranty,tracking_token')
    .eq('tracking_token', params.token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  // Never return a stored device password to a public browser.
  return NextResponse.json({
    job: {
      ...data,
      device_password: undefined,
      has_device_password: Boolean(data.device_password),
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
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
    .select('id,job_ref,is_warranty')
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

  return NextResponse.json({ success: true, job_ref: job.job_ref })
}
