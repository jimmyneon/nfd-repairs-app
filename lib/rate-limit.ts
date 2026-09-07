/**
 * Simple IP-based rate limiting using Supabase REST API.
 * Uses a `rate_limits` table — no external service required.
 *
 * Table schema:
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id BIGSERIAL PRIMARY KEY,
 *     ip TEXT NOT NULL,
 *     endpoint TEXT NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS rate_limits_ip_endpoint_idx
 *     ON rate_limits (ip, endpoint, created_at DESC);
 */

const WINDOW_SECONDS = 60
const DEFAULT_MAX_REQUESTS = 10

export async function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS
): Promise<{ allowed: boolean; remaining: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()

  try {
    // Count requests in the current window using REST API
    const countUrl = `${supabaseUrl}/rest/v1/rate_limits?select=id&ip=eq.${encodeURIComponent(ip)}&endpoint=eq.${encodeURIComponent(endpoint)}&created_at=gte.${windowStart}`
    const countRes = await fetch(countUrl, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Range': '0-0',
      },
    })

    if (!countRes.ok) {
      console.error('[RateLimit] Count query failed:', countRes.status)
      return { allowed: true, remaining: maxRequests } // fail open
    }

    // Parse count from Content-Range header (e.g. "0-0/15" or "*/0")
    const contentRange = countRes.headers.get('content-range') || ''
    const match = contentRange.match(/\/(\d+)/)
    const currentCount = match ? parseInt(match[1], 10) : 0

    if (currentCount >= maxRequests) {
      return { allowed: false, remaining: 0 }
    }

    // Log this request using REST API
    const insertUrl = `${supabaseUrl}/rest/v1/rate_limits`
    await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ ip, endpoint }),
    })

    // Best-effort cleanup (1% of requests)
    if (Math.random() < 0.01) {
      const cleanupStart = new Date(Date.now() - 3600 * 1000).toISOString()
      fetch(`${supabaseUrl}/rest/v1/rate_limits?created_at=lt.${cleanupStart}`, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }).catch(() => {})
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
