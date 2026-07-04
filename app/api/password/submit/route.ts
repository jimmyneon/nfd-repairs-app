import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCipheriv, randomBytes } from 'crypto'

/**
 * POST /api/password/submit
 * Accepts a password submission from a customer via the secure link.
 * Encrypts the password with AES-256-GCM and stores it in the database.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { token, password, notApplicable } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find the password request
    const { data: passwordRequest, error: reqError } = await supabase
      .from('password_requests')
      .select('*, jobs(id, job_ref, customer_name)')
      .eq('token', token)
      .single()

    if (reqError || !passwordRequest) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    }

    // Check if already submitted
    if (passwordRequest.status === 'SUBMITTED') {
      return NextResponse.json({ error: 'Password already submitted' }, { status: 400 })
    }

    // Check if expired
    if (passwordRequest.status === 'EXPIRED' || new Date(passwordRequest.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 400 })
    }

    if (notApplicable) {
      // Customer marked password as not applicable
      await supabase
        .from('password_requests')
        .update({
          status: 'SUBMITTED',
          submitted_at: new Date().toISOString(),
          encrypted_password: 'N/A',
        })
        .eq('id', passwordRequest.id)

      // Update the job
      await supabase
        .from('jobs')
        .update({
          password_not_applicable: true,
          device_password: null,
        })
        .eq('id', passwordRequest.job_id)

      // Log job event
      await supabase.from('job_events').insert({
        job_id: passwordRequest.job_id,
        type: 'SYSTEM',
        message: 'Customer marked device password as not applicable via secure link',
      })

      return NextResponse.json({ success: true, notApplicable: true })
    }

    if (!password || !password.trim()) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    // Encrypt the password using AES-256-GCM
    const encryptionKey = process.env.PASSWORD_ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error('PASSWORD_ENCRYPTION_KEY not configured')
      return NextResponse.json({ error: 'Encryption not configured' }, { status: 500 })
    }

    const key = Buffer.from(encryptionKey, 'hex')
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    let encrypted = cipher.update(password.trim(), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()

    // Store encrypted password
    await supabase
      .from('password_requests')
      .update({
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
        encrypted_password: encrypted,
        encryption_iv: iv.toString('hex'),
        encryption_auth_tag: authTag.toString('hex'),
      })
      .eq('id', passwordRequest.id)

    // Update the job to indicate password has been provided (store a reference, not the plaintext)
    await supabase
      .from('jobs')
      .update({
        device_password: 'ENCRYPTED:' + passwordRequest.id,
        password_not_applicable: false,
      })
      .eq('id', passwordRequest.job_id)

    // Log job event
    await supabase.from('job_events').insert({
      job_id: passwordRequest.job_id,
      type: 'SYSTEM',
      message: 'Device password submitted securely by customer via link',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in password submit:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/password/submit?token=xxx
 * Validates a password request token and returns job info for the form.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const { data: passwordRequest, error } = await supabase
      .from('password_requests')
      .select('status, expires_at, jobs(customer_name, device_make, device_model)')
      .eq('token', token)
      .single()

    if (error || !passwordRequest) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    }

    if (passwordRequest.status === 'SUBMITTED') {
      return NextResponse.json({ alreadySubmitted: true })
    }

    if (passwordRequest.status === 'EXPIRED' || new Date(passwordRequest.expires_at) < new Date()) {
      return NextResponse.json({ expired: true })
    }

    return NextResponse.json({
      valid: true,
      job: passwordRequest.jobs,
    })
  } catch (error) {
    console.error('Error validating password token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
