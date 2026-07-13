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

    return NextResponse.json({ enquiry }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error fetching quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
