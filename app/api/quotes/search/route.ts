import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-browser'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const searchType = searchParams.get('type') || 'all'

    const supabase = createClient()

    let dbQuery = supabase
      .from('quotes')
      .select('*')
      .eq('converted_to_job', false)
      .order('created_at', { ascending: false })
      .limit(50)

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
          dbQuery = dbQuery.eq('quote_request_id', searchTerm)
          break
        default:
          dbQuery = dbQuery.or(`customer_phone.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,device_make.ilike.%${searchTerm}%,device_model.ilike.%${searchTerm}%`)
      }
    }

    const { data: quotes, error } = await dbQuery

    if (error) {
      console.error('Quote search error:', error)
      return NextResponse.json(
        { error: 'Failed to search quotes', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      quotes: quotes || [],
      count: quotes?.length || 0,
    })

  } catch (error) {
    console.error('Quote search error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
