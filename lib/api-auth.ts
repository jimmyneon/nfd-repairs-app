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

/**
 * Allow either a logged-in staff user (cookie auth) OR a cron secret (Bearer token).
 * Use this for routes called from both the authenticated job page and cron jobs.
 * Returns null if authorised, or a 401 NextResponse if not.
 */
export async function requireStaffOrCron(request: NextRequest): Promise<NextResponse | null> {
  // Try cron secret first (fast, no DB call)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return null
  }

  // Fall back to staff user cookie auth
  const { response } = await requireStaffUser(request)
  if (response) {
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
  // Allow localhost / 127.0.0.1 origins for local development (any port)
  // Only in non-production to avoid exposing in prod
  if (process.env.NODE_ENV !== 'production' && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin
  }
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
