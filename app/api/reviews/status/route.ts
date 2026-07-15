import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { searchParams } = new URL(request.url)
    const ref = searchParams.get('ref')

    if (!ref) {
      return NextResponse.json({ error: 'Missing ref parameter' }, { status: 400 })
    }

    // Find the job by job_ref or tracking_token
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, review_platforms_completed, last_review_platform_requested')
      .or(`job_ref.eq.${ref},tracking_token.eq.${ref}`)
      .single()

    if (error || !job) {
      // Also try enquiries table (for quote-based review requests)
      const { data: enquiry, error: enqError } = await supabase
        .from('enquiries')
        .select('id, enquiry_ref, customer_name')
        .eq('enquiry_ref', ref)
        .single()

      if (enqError || !enquiry) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      // Return empty status for enquiries (no review tracking yet)
      return NextResponse.json({
        customer_name: enquiry.customer_name,
        platforms_clicked: [],
        platforms_completed: [],
        review_links: await getReviewLinks(supabase),
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Get review links from admin_settings
    const reviewLinks = await getReviewLinks(supabase)

    // review_platforms_completed stores platforms the customer clicked through
    const platformsClicked: string[] = job.review_platforms_completed || []

    return NextResponse.json({
      customer_name: job.customer_name,
      platforms_clicked: platformsClicked,
      last_requested: job.last_review_platform_requested,
      review_links: reviewLinks,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error fetching review status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getReviewLinks(supabase: ReturnType<typeof createClient>) {
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['google_review_link', 'facebook_review_link', 'trustpilot_review_link'])

  const links: Record<string, string> = {}
  for (const s of settings || []) {
    links[s.key.replace('_review_link', '')] = s.value
  }

  return {
    google: links.google || 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review',
    facebook: links.facebook || 'https://www.facebook.com/NFDrepairs/reviews/',
    trustpilot: links.trustpilot || 'https://uk.trustpilot.com/review/newforestdevicerepairs.co.uk',
  }
}
