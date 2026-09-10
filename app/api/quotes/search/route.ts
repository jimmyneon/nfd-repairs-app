import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffUser } from '@/lib/api-auth'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * GET /api/quotes/search
 *
 * Searches the enquiries table (the new quote system) for repair_quote
 * enquiries that haven't been converted to jobs yet. Results are mapped
 * to the same shape as the old quotes table so the QuoteLookupModal
 * doesn't need to change.
 */
export async function GET(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const searchType = searchParams.get('type') || 'all'
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Create Supabase client with service role for server-side access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let dbQuery = supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_type', 'repair_quote')
      .eq('converted_to_job', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (query && query.trim()) {
      const searchTerm = query.trim()

      switch (searchType) {
        case 'phone':
          dbQuery = dbQuery.ilike('customer_phone', `%${searchTerm}%`)
          break
        case 'name':
          dbQuery = dbQuery.ilike('customer_name', `%${searchTerm}%`)
          break
        case 'quote_id':
          dbQuery = dbQuery.eq('enquiry_ref', searchTerm)
          break
        default:
          dbQuery = dbQuery.or(`customer_phone.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,device_make.ilike.%${searchTerm}%,device_model.ilike.%${searchTerm}%`)
      }
    }

    const { data: enquiries, error } = await dbQuery

    if (error) {
      console.error('Enquiry search error:', error)
      return NextResponse.json(
        { error: 'Failed to search enquiries', details: error.message },
        { status: 500 }
      )
    }

    // Map enquiries to the Quote shape expected by QuoteLookupModal
    const quotes = (enquiries || []).map((e: any) => ({
      id: e.id,
      quote_request_id: e.enquiry_ref,
      customer_name: e.customer_name,
      customer_phone: e.customer_phone || '',
      customer_email: e.customer_email || null,
      device_type: e.device_category || null,
      device_make: e.device_make || '',
      device_model: e.device_model || '',
      issue: e.repair_type || '',
      description: e.issue_description || null,
      quoted_price: e.quoted_price ?? null,
      status: e.status || 'pending',
      created_at: e.created_at,
      original_created_at: e.created_at,
    }))

    return NextResponse.json({
      success: true,
      quotes,
      count: quotes.length,
    })

  } catch (error) {
    console.error('Enquiry search error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
