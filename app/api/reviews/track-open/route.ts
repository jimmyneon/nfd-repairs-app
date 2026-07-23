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
    const { ref } = body

    if (!ref) {
      return NextResponse.json({ error: 'Missing ref' }, { status: 400 })
    }

    // Find the job by job_ref or tracking_token
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_ref, review_link_opened_at')
      .or(`job_ref.eq.${ref},tracking_token.eq.${ref}`)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Only log the first time the link is opened
    if (!job.review_link_opened_at) {
      await supabase
        .from('jobs')
        .update({ review_link_opened_at: new Date().toISOString() })
        .eq('id', job.id)

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: 'Customer opened the review link from SMS',
      })
    }

    return NextResponse.json({
      success: true,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error tracking review link open:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
