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
  operation: () => Promise<T> | any,
  maxRetries = 3,
  baseDelayMs = 200
): Promise<T> {
  let lastResult: T | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      lastResult = await operation()
      // Check if the result has an error property (Supabase responses do)
      const maybeError = (lastResult as any)?.error
      if (!maybeError) return lastResult as T

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
      return lastResult as T
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

// iD Mobile's published non-standard 07 ranges. These can incur out-of-plan
// charges even though they look like normal UK mobile numbers.
// Source: https://media.secure-mobiles.com/idmobile/documents/non-standard-07-numbers-v2.pdf
const ID_MOBILE_NON_STANDARD_07_PREFIXES = [
  '0740659', '074060', '074061', '074062', '074067', '074176', '074181', '074182', '074185',
  '074409', '074412', '074414', '074515', '075200', '075201', '075203', '075204', '075205',
  '075207', '075208', '075209', '075370', '075373', '075375', '075376', '075377', '075580',
  '075581', '075582', '075590', '075591', '075592', '075593', '075594', '075595', '075596',
  '075597', '075598', '075710', '075718', '075890', '075891', '075892', '075893', '075898',
  '075899', '077000', '077001', '077442', '077443', '077444', '077445', '077446', '077447',
  '077448', '077449', '077552', '077553', '077554', '077555', '078220', '078221', '078223',
  '078224', '078225', '078226', '078227', '078229', '078644', '078722', '078727', '078730',
  '078744', '078745', '078920', '078922', '078925', '078930', '078931', '078933', '078938',
  '078939', '079111', '079112', '079117', '079118', '079245', '079246', '079780', '079781',
  '079782', '079783', '079784', '079785', '079786', '079787', '079788', '079789',
] as const

// Channel Islands / Isle of Man mobile ranges that iD treats as international.
// Source: https://www.idmobile.co.uk/help-and-support/channelislands
const ID_MOBILE_OFFSHORE_PREFIXES = [
  '074184',
  '074520', '074521', '074522', '074523', '074524', '074525', '074526',
  '075090', '075091', '075092', '075093', '075094', '075095', '075096', '075097',
  '077003', '077007', '077008', '07781', '077977', '077978', '077979',
  '078297', '078298', '078299', '078391', '078392', '078397', '078398',
  '079240', '079241', '079242', '079243', '079244', '079247', '079248',
  '079370', '079371', '079372', '079373', '079374', '079375', '079376', '079377', '079378', '079379',
] as const

/**
 * Normalise common UK formats (+447..., 00447..., 07...) to 07...
 * for destination safety checks.
 */
function normaliseUkSmsDestination(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '')
  if (digits.startsWith('0044')) return `0${digits.slice(4)}`
  if (digits.startsWith('44')) return `0${digits.slice(2)}`
  return digits
}

/**
 * Protect the automated SMS system from chargeable / non-standard destinations.
 * Automation is deliberately restricted to standard mainland UK mobile numbers.
 */
export function isSafeSmsDestination(rawPhone: string): {
  ok: boolean
  normalized: string
  reason?: string
} {
  const normalized = normaliseUkSmsDestination(rawPhone)

  // Never auto-text international numbers, landlines, shortcodes, malformed
  // numbers, etc. The repair app's automated messaging is UK-mobile only.
  if (!/^07\d{9}$/.test(normalized)) {
    return { ok: false, normalized, reason: 'NOT_STANDARD_UK_MOBILE' }
  }

  // 070 personal/corporate numbering and 076 pager services are chargeable.
  if (normalized.startsWith('070')) {
    return { ok: false, normalized, reason: 'PERSONAL_OR_CORPORATE_070' }
  }
  if (normalized.startsWith('076')) {
    return { ok: false, normalized, reason: 'PAGER_OR_IOM_076' }
  }

  if (ID_MOBILE_NON_STANDARD_07_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return { ok: false, normalized, reason: 'ID_MOBILE_NON_STANDARD_07' }
  }

  if (ID_MOBILE_OFFSHORE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return { ok: false, normalized, reason: 'CHANNEL_ISLANDS_OR_IOM' }
  }

  return { ok: true, normalized }
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
  const destination = isSafeSmsDestination(phone)
  if (!destination.ok) {
    const body = `BLOCKED_CHARGEABLE_NUMBER:${destination.reason}`
    console.warn(`[sms-safety] Blocked automatic SMS to ${phone}: ${destination.reason}`)
    // 422 makes queue senders treat this as a permanent rejection rather than
    // a transient network failure, so it is not retried repeatedly.
    return { ok: false, status: 422, body }
  }

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

/**
 * Quick health check for Supabase — tries a simple query.
 * Returns true if Supabase is responding, false if it's down.
 * Use this before attempting batch operations.
 */
export async function isSupabaseHealthy(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('jobs')
      .select('id')
      .limit(1)
    return !error
  } catch {
    return false
  }
}
