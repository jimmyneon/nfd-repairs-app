import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await request.json()
    const { ref, platform } = body

    if (!ref || !platform) {
      return NextResponse.json({ error: 'Missing ref or platform' }, { status: 400 })
    }

    const validPlatforms = ['google', 'facebook', 'trustpilot']
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    // Find the job by job_ref or tracking_token
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, review_platforms_completed')
      .or(`job_ref.eq.${ref},tracking_token.eq.${ref}`)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Add platform to completed array if not already there
    const current: string[] = job.review_platforms_completed || []
    if (!current.includes(platform)) {
      current.push(platform)

      await supabase
        .from('jobs')
        .update({ review_platforms_completed: current } as any)
        .eq('id', job.id)

      // Log the event
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Customer clicked ${platform} review link on review page`,
      } as any)
    }

    return NextResponse.json({
      success: true,
      platform,
      platforms_completed: current,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error tracking review click:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
