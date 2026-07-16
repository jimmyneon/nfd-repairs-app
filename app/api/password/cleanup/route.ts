import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/password/cleanup
 * Called by cron to auto-delete encrypted passwords 7 days after job collection.
 * Also expires any pending requests past their 24h expiry.
 */
export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Delete encrypted passwords for jobs collected 7+ days ago
    const { data: collectedJobs, error: collectedError } = await supabase
      .from('jobs')
      .select('id, job_ref, updated_at')
      .eq('status', 'COLLECTED')
      .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (collectedError) {
      console.error('Error fetching collected jobs:', collectedError)
    }

    let deletedCount = 0
    if (collectedJobs && collectedJobs.length > 0) {
      const jobIds = collectedJobs.map(j => j.id)

      const { data: deleted, error: deleteError } = await supabase
        .from('password_requests')
        .update({
          encrypted_password: null,
          encryption_iv: null,
          encryption_auth_tag: null,
          password_deleted_at: new Date().toISOString(),
          status: 'DELETED',
        })
        .in('job_id', jobIds)
        .not('encrypted_password', 'is', null)
        .is('password_deleted_at', null)
        .select('id')

      deletedCount = deleted?.length || 0

      if (deleteError) {
        console.error('Error deleting old passwords:', deleteError)
      }

      // Also clear the device_password field on the job
      if (deletedCount > 0) {
        const deletedJobIds = collectedJobs
          .filter(j => true) // All collected jobs that had passwords
          .map(j => j.id)

        await supabase
          .from('jobs')
          .update({ device_password: null })
          .in('id', deletedJobIds)
          .like('device_password', 'ENCRYPTED:%')
      }
    }

    // 2. Expire pending requests past their 24h expiry
    const { data: expired, error: expireError } = await supabase
      .from('password_requests')
      .update({ status: 'EXPIRED' })
      .eq('status', 'PENDING')
      .lt('expires_at', new Date().toISOString())
      .select('id')

    const expiredCount = expired?.length || 0

    if (expireError) {
      console.error('Error expiring requests:', expireError)
    }

    console.log(`Password cleanup: ${deletedCount} deleted, ${expiredCount} expired`)

    return NextResponse.json({
      success: true,
      deletedCount,
      expiredCount,
    })
  } catch (error) {
    console.error('Error in password cleanup:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
