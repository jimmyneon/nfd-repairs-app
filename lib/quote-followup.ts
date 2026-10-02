import { countTradingDaysAfter, OpeningHoursMap } from './awaiting-device-followup'

export type QuoteFollowupEnquiry = {
  enquiry_type?: string | null
  status?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  quoted_price?: number | string | null
  quote_sent_method?: string | null
  quote_sent_at?: string | null
  proceed_with_repair?: boolean | null
  converted_to_job?: boolean | null
  quote_followup_at?: string | null
  quote_followup_suppressed?: boolean | null
  created_at?: string | null
}

const TEST_PHONE_DIGITS = new Set(['07410381247', '447410381247'])
const TEST_EMAILS = new Set(['nfdrepairs@gmail.com'])

function phoneDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '')
}

export function isKnownTestEnquiry(enquiry: QuoteFollowupEnquiry): boolean {
  if (TEST_PHONE_DIGITS.has(phoneDigits(enquiry.customer_phone))) return true
  if (TEST_EMAILS.has(String(enquiry.customer_email || '').trim().toLowerCase())) return true
  const name = String(enquiry.customer_name || '').trim().toLowerCase()
  return name === 'test' || name.startsWith('test ')
}

export function isShopOpenOnDate(
  openingHours: OpeningHoursMap,
  now = new Date()
): boolean {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
  }).format(now)

  return openingHours[weekday]?.isOpen === true
}

export function isQuoteFollowupDue(
  enquiry: QuoteFollowupEnquiry,
  openingHours: OpeningHoursMap,
  now = new Date()
): boolean {
  if (!isShopOpenOnDate(openingHours, now)) return false
  if (enquiry.enquiry_type !== 'repair_quote') return false
  if (enquiry.status !== 'pending') return false
  if (enquiry.proceed_with_repair || enquiry.converted_to_job) return false
  if (enquiry.quote_followup_at || enquiry.quote_followup_suppressed) return false
  if (!String(enquiry.customer_phone || '').trim()) return false
  if (!enquiry.quote_sent_method || enquiry.quote_sent_method === 'none') return false

  const quotedPrice = Number(enquiry.quoted_price)
  if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) return false
  if (isKnownTestEnquiry(enquiry)) return false

  // New quotes use the real delivery time. Older quotes created before this
  // tracking field existed retain the original created_at fallback.
  const anchor = enquiry.quote_sent_at || enquiry.created_at
  if (!anchor) return false
  const anchorDate = new Date(anchor)
  if (Number.isNaN(anchorDate.getTime())) return false

  const ageDays = (now.getTime() - anchorDate.getTime()) / 86_400_000
  if (ageDays < 0 || ageDays > 21) return false

  return countTradingDaysAfter(anchor, now, openingHours) >= 2
}
