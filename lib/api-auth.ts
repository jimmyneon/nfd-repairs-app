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

  // Check for staff role via app_metadata
  const staffEmails = process.env.STAFF_EMAILS
  if (staffEmails) {
    const allowed = staffEmails.split(',').map(e => e.trim().toLowerCase())
    if (!allowed.includes((user.email || '').toLowerCase())) {
      return { user: null, response: NextResponse.json({ error: 'Staff access required' }, { status: 403 }) }
    }
  }

  return { user, response: null }
}

/** Verify CRON_SECRET bearer token for cron job endpoints. */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/** Get allowed CORS origin based on request origin. */
export function getAllowedOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin')
  const allowedOrigins = [
    'https://nfd-repairs-app.vercel.app',
    'https://nfdr.uk',
    'https://newforestdevicerepairs.co.uk',
    'https://www.newforestdevicerepairs.co.uk',
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean)
  if (origin && allowedOrigins.includes(origin)) {
    return origin
  }
  return allowedOrigins[0] || 'https://nfd-repairs-app.vercel.app'
}

/** Build CORS headers for a response. */
export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = getAllowedOrigin(request)
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}
