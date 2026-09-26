import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Redirect to dashboard if already authenticated and visiting /login or /signup
  if (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup') {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        return NextResponse.redirect(new URL('/app/jobs', req.url))
      }
    } catch (error) {
      // Not authenticated, allow access to login/signup
    }
    return response
  }

  // Protect /app routes - redirect to login if no user, preserving the
  // intended destination so deep links (e.g. /app/enquiries?ref=ENQ-123
  // from notification taps) survive the login round-trip.
  if (req.nextUrl.pathname.startsWith('/app')) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set(
      'next',
      req.nextUrl.pathname + req.nextUrl.search,
    )
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.redirect(loginUrl)
      }
    } catch (error) {
      // If auth check fails, redirect to login
      return NextResponse.redirect(loginUrl)
    }
  }

  return response
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
}
