import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/** Verify the signed-in Supabase user for privileged API actions. */
export async function requireStaffUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Route handlers do not need to refresh cookies for this check.
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { user: null, response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  }

  return { user, response: null }
}
