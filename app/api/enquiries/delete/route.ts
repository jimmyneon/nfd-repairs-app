import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { corsHeaders, requireStaffUser } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  })
}

// Staff-only: permanently delete an enquiry. Uses the service role because
// the enquiries RLS policies only grant SELECT/INSERT/UPDATE to staff.
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'enquiries_delete', 10)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers }
      )
    }

    const { response: authResponse } = await requireStaffUser(request)
    if (authResponse) return authResponse

    const body = await request.json()
    const ids: string[] = Array.isArray(body.enquiry_ids)
      ? body.enquiry_ids.filter((x: unknown) => typeof x === 'string')
      : (body.enquiry_id ? [body.enquiry_id] : [])
    if (!ids.length || ids.length > 100) {
      return NextResponse.json({ error: 'Provide 1-100 enquiry_ids' }, { status: 400, headers })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error } = await supabase
      .from('enquiries')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('Failed to delete enquiry:', error)
      return NextResponse.json({ error: 'Failed to delete enquiry' }, { status: 500, headers })
    }

    return NextResponse.json({ success: true, deleted: ids.length }, { headers })
  } catch (e) {
    console.error('Delete enquiry error:', e)
    return NextResponse.json({ error: 'Failed to delete enquiry' }, { status: 500, headers })
  }
}
