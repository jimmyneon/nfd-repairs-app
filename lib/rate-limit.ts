import { createClient } from '@supabase/supabase-js'

/**
 * Simple IP-based rate limiting using Supabase.
 * No external service required — uses a `rate_limits` table.
 *
 * Table schema (run in Supabase SQL editor):
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id BIGSERIAL PRIMARY KEY,
 *     ip TEXT NOT NULL,
 *     endpoint TEXT NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS rate_limits_ip_endpoint_idx
 *     ON rate_limits (ip, endpoint, created_at DESC);
 *
 * Call cleanup periodically or set a retention policy:
 *   DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
 */

const WINDOW_SECONDS = 60 // 1 minute window
const DEFAULT_MAX_REQUESTS = 10 // 10 requests per minute per IP per endpoint

export async function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()

    // Count requests in the current window
    const { count, error } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart)

    if (error) {
      console.error('[RateLimit] Error checking rate limit:', error)
      // Fail open — allow the request if we can't check
      return { allowed: true, remaining: maxRequests, resetAt: Date.now() + WINDOW_SECONDS * 1000 }
    }

    const currentCount = count || 0
    const allowed = currentCount < maxRequests
    const remaining = Math.max(0, maxRequests - currentCount - 1)
    const resetAt = Date.now() + WINDOW_SECONDS * 1000

    if (allowed) {
      // Log this request
      await supabase
        .from('rate_limits')
        .insert({ ip, endpoint })
        .then(() => {
          // Best-effort cleanup — delete old entries occasionally
          // (1 in 100 chance to avoid overhead on every request)
          if (Math.random() < 0.01) {
            supabase
              .from('rate_limits')
              .delete()
              .lt('created_at', new Date(Date.now() - 3600 * 1000).toISOString())
              .then(() => {})
              .catch(() => {})
          }
        })
        .catch((e) => console.error('[RateLimit] Insert failed:', e))
    }

    return { allowed, remaining, resetAt }
  } catch (e) {
    console.error('[RateLimit] Exception:', e)
    // Fail open
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + WINDOW_SECONDS * 1000 }
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
