import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffUser } from '@/lib/api-auth'
import { ENQUIRY_SEARCH_MAX_LENGTH, quoteSearchFilters } from '@/lib/enquiry-search'

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
  try {
    const { response: authResponse } = await requireStaffUser(request)
    if (authResponse) return authResponse

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('q')?.trim() ?? ''
    const searchType = searchParams.get('type') || 'all'
    const requestedLimit = Number(searchParams.get('limit') ?? 50)
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50

    if (search.length > ENQUIRY_SEARCH_MAX_LENGTH) {
      return NextResponse.json({ error: 'Search term is too long' }, { status: 400 })
    }

    // Create Supabase client with service role for server-side access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let dbQuery = supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_type', 'repair_quote')
      .not('converted_to_job', 'is', true)
      .is('converted_job_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)

    if (search) {
      if (searchType === 'quote_id') {
        dbQuery = dbQuery.eq('enquiry_ref', search)
      } else {
        for (const filter of quoteSearchFilters(search, searchType)) {
          dbQuery = dbQuery.or(filter)
        }
      }
    }

    const { data: enquiries, error } = await dbQuery

    if (error) {
      console.error('Enquiry search error:', error)
      return NextResponse.json(
        { error: 'Could not search quotes' },
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
      { error: 'Could not search quotes' },
      { status: 500 }
    )
  }
}
