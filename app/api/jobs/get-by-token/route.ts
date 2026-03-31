import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * GET /api/jobs/get-by-token?token=xxx
 * Get job ID from tracking token
 * Used by QR scanner to route to staff job page
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Get job by tracking token
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_ref, status')
      .eq('tracking_token', token)
      .single()

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      job_id: job.id,
      job_ref: job.job_ref,
      status: job.status
    })

  } catch (error) {
    console.error('Error in get-by-token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
