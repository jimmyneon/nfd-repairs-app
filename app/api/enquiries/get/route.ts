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

    const { data: enquiry, error } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', ref)
      .single()

    if (error || !enquiry) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Only return repair quotes
    if (enquiry.enquiry_type !== 'repair_quote') {
      return NextResponse.json({ error: 'Invalid quote type' }, { status: 400 })
    }

    // Expiry check: quote valid for 14 days from submission
    if (enquiry.created_at) {
      const created = new Date(enquiry.created_at)
      const expiry = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000)
      if (new Date() > expiry) {
        return NextResponse.json({ error: 'This quote has expired. Quotes are valid for 14 days.' }, { status: 410 })
      }
    }

    // Only return non-sensitive fields — no customer name, phone, or email
    const safeEnquiry = {
      enquiry_ref: enquiry.enquiry_ref,
      device_make: enquiry.device_make,
      device_model: enquiry.device_model,
      repair_type: enquiry.repair_type,
      quoted_price: enquiry.quoted_price,
      quote_type: enquiry.quote_type,
      part_option: enquiry.part_option || enquiry.screen_option,
      display_price: enquiry.display_price,
      warranty: enquiry.warranty,
      estimated_time: enquiry.estimated_time,
      additional_repairs: enquiry.additional_repairs,
      status: enquiry.status,
    }

    return NextResponse.json({ enquiry: safeEnquiry }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error fetching quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
