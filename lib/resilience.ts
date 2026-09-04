import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Create a Supabase service-role client with retry-friendly settings.
 * Used by API routes and cron handlers.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

/**
 * Retry a Supabase operation up to `maxRetries` times.
 * Handles transient 401 / network errors (Supabase JWT incident workaround).
 *
 * Usage:
 *   const { data, error } = await supabaseRetry(() =>
 *     supabase.from('sms_logs').insert({...}).select().single()
 *   )
 */
export async function supabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 200
): Promise<T> {
  let lastResult: T | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      lastResult = await operation()
      // Check if the result has an error property (Supabase responses do)
      const maybeError = (lastResult as any)?.error
      if (!maybeError) return lastResult

      // Retry on 401 (JWT rejection) or connection errors
      const msg = String(maybeError?.message || '')
      if (
        msg.includes('401') ||
        msg.includes('JWT') ||
        msg.includes('fetch failed') ||
        msg.includes('network') ||
        msg.includes('ECONNRESET') ||
        msg.includes('timeout')
      ) {
        console.warn(`Supabase retry ${attempt + 1}/${maxRetries}: ${msg.slice(0, 120)}`)
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)))
        continue
      }

      // Non-retryable error — return immediately
      return lastResult
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (attempt < maxRetries - 1) {
        console.warn(`Supabase exception retry ${attempt + 1}/${maxRetries}: ${msg.slice(0, 120)}`)
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  return lastResult as T
}

/**
 * Fetch with timeout via AbortController.
 * Returns the Response or throws on timeout.
 *
 * @param url - URL to fetch
 * @param options - standard fetch options
 * @param timeoutMs - timeout in milliseconds (default 15s)
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url.slice(0, 80)}`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Send an SMS via MacroDroid webhook with timeout.
 * Returns { ok, status, body } — never throws.
 */
export async function sendViaMacroDroid(
  webhookUrl: string,
  phone: string,
  message: string,
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const response = await fetchWithTimeout(
      webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      },
      timeoutMs
    )
    const body = await response.text()
    return { ok: response.ok, status: response.status, body }
  } catch (err: any) {
    console.error('MacroDroid send failed:', err.message)
    return { ok: false, status: 0, body: err.message || 'Network error' }
  }
}

/**
 * Get current hour in UK local time (handles BST/GMT).
 * Vercel runs in UTC, so we need this for sending-hour windows.
 */
export function getUKHour(): number {
  const now = new Date()
  // Format in Europe/London timezone, extract hour
  const ukTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hour12: false,
  }).format(now)
  return parseInt(ukTime, 10)
}

/**
 * Check if we're within allowed SMS sending hours (8am-8pm UK time).
 */
export function isWithinUKSendingHours(): boolean {
  const hour = getUKHour()
  return hour >= 8 && hour < 20
}
