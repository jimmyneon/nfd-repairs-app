import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createDecipheriv } from 'crypto'

/**
 * POST /api/password/decrypt
 * Decrypts a stored device password for staff use.
 * Only accessible with service role key (server-side).
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

    // Find the password request for this job
    const { data: passwordRequest, error } = await supabase
      .from('password_requests')
      .select('encrypted_password, encryption_iv, encryption_auth_tag, status, password_deleted_at')
      .eq('job_id', jobId)
      .eq('status', 'SUBMITTED')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !passwordRequest) {
      return NextResponse.json({ error: 'No password found' }, { status: 404 })
    }

    if (passwordRequest.password_deleted_at || !passwordRequest.encrypted_password) {
      return NextResponse.json({ error: 'Password has been deleted' }, { status: 410 })
    }

    if (passwordRequest.encrypted_password === 'N/A') {
      return NextResponse.json({ password: null, notApplicable: true })
    }

    // Decrypt
    const encryptionKey = process.env.PASSWORD_ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error('PASSWORD_ENCRYPTION_KEY not configured')
      return NextResponse.json({ error: 'Decryption not configured' }, { status: 500 })
    }

    const key = Buffer.from(encryptionKey, 'hex')
    const iv = Buffer.from(passwordRequest.encryption_iv, 'hex')
    const authTag = Buffer.from(passwordRequest.encryption_auth_tag, 'hex')

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(passwordRequest.encrypted_password, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    // Log access
    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: 'Device password decrypted by staff',
    })

    return NextResponse.json({ password: decrypted })
  } catch (error) {
    console.error('Error decrypting password:', error)
    return NextResponse.json({ error: 'Failed to decrypt' }, { status: 500 })
  }
}
