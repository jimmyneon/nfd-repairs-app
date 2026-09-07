import { createClient } from '@supabase/supabase-js'

/**
 * Simple IP-based rate limiting using Supabase.
 * Uses a `rate_limits` table — no external service required.
 */

const WINDOW_SECONDS = 60
const DEFAULT_MAX_REQUESTS = 10

// Reuse a single client instance across calls
let _client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _client
}

export async function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const supabase = getClient()
    const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()

    // Count requests in the current window — fetch all matching rows and count
    const { data, error } = await (supabase as any)
      .from('rate_limits')
      .select('id')
      .eq('ip', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart)

    if (error) {
      console.error('[RateLimit] Query error:', error.message)
      return { allowed: true, remaining: maxRequests } // fail open
    }

    const currentCount = data ? data.length : 0

    if (currentCount >= maxRequests) {
      return { allowed: false, remaining: 0 }
    }

    // Log this request
    const { error: insertError } = await (supabase as any)
      .from('rate_limits')
      .insert({ ip, endpoint })

    if (insertError) {
      console.error('[RateLimit] Insert error:', insertError.message)
    }

    // Best-effort cleanup (1% of requests)
    if (Math.random() < 0.01) {
      const cleanupStart = new Date(Date.now() - 3600 * 1000).toISOString()
      void (supabase as any)
        .from('rate_limits')
        .delete()
        .lt('created_at', cleanupStart)
        .then(() => {})
        .catch(() => {})
    }

    return { allowed: true, remaining: maxRequests - currentCount - 1 }
  } catch (e) {
    console.error('[RateLimit] Exception:', e)
    return { allowed: true, remaining: maxRequests } // fail open
  }
}

/** Extract client IP from request headers */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP.trim()
  return 'unknown'
}
