import { describe, expect, it } from 'vitest'
import { parseOpeningHours } from '../lib/awaiting-device-followup'
import { isKnownTestEnquiry, isQuoteFollowupDue } from '../lib/quote-followup'

const hours = parseOpeningHours(JSON.stringify({
  Sunday: { isOpen: false },
  Monday: { isOpen: true },
  Tuesday: { isOpen: false },
  Wednesday: { isOpen: true },
  Thursday: { isOpen: true },
  Friday: { isOpen: true },
  Saturday: { isOpen: true },
}))

const base = {
  enquiry_type: 'repair_quote',
  status: 'pending',
  customer_name: 'Real Customer',
  customer_phone: '07700 900123',
  customer_email: 'customer@example.com',
  quoted_price: 65,
  quote_sent_method: 'both',
  proceed_with_repair: false,
  converted_to_job: false,
  quote_followup_at: null,
  quote_followup_suppressed: false,
  created_at: '2026-09-28T10:00:00+01:00',
}

describe('quote follow-up eligibility', () => {
  it('waits for two trading days', () => {
    expect(isQuoteFollowupDue(base, hours, new Date('2026-09-30T10:30:00+01:00'))).toBe(false)
    expect(isQuoteFollowupDue(base, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(true)
  })

  it('only follows up direct priced quotes once', () => {
    const now = new Date('2026-10-01T10:30:00+01:00')
    expect(isQuoteFollowupDue({ ...base, status: 'more_info_requested' }, hours, now)).toBe(false)
    expect(isQuoteFollowupDue({ ...base, quoted_price: null }, hours, now)).toBe(false)
    expect(isQuoteFollowupDue({ ...base, quote_sent_method: null }, hours, now)).toBe(false)
    expect(isQuoteFollowupDue({ ...base, proceed_with_repair: true }, hours, now)).toBe(false)
    expect(isQuoteFollowupDue({ ...base, quote_followup_at: '2026-10-01T09:00:00Z' }, hours, now)).toBe(false)
  })

  it('never follows up known NFD test enquiries', () => {
    expect(isKnownTestEnquiry({ ...base, customer_phone: '07410 381247' })).toBe(true)
    expect(isKnownTestEnquiry({ ...base, customer_phone: '+447410381247' })).toBe(true)
    expect(isKnownTestEnquiry({ ...base, customer_email: 'nfdrepairs@gmail.com' })).toBe(true)
    expect(isQuoteFollowupDue({ ...base, customer_phone: '+447410381247' }, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(false)
  })

  it('does not revive quotes older than 21 days', () => {
    expect(isQuoteFollowupDue({
      ...base,
      created_at: '2026-09-01T10:00:00+01:00',
    }, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(false)
  })
})
