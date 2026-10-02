import { describe, expect, it } from 'vitest'
import { parseOpeningHours } from '../lib/awaiting-device-followup'
import { isKnownTestEnquiry, isQuoteFollowupDue, isShopOpenOnDate } from '../lib/quote-followup'

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
  quote_sent_at: '2026-09-28T10:00:00+01:00',
  proceed_with_repair: false,
  converted_to_job: false,
  quote_followup_at: null,
  quote_followup_suppressed: false,
  created_at: '2026-09-28T08:00:00+01:00',
}

describe('quote follow-up eligibility', () => {
  it('waits for two trading days from the delivered quote time', () => {
    expect(isQuoteFollowupDue(base, hours, new Date('2026-09-30T10:30:00+01:00'))).toBe(false)
    expect(isQuoteFollowupDue(base, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(true)
  })

  it('does not send on a closed day and naturally rolls to the next open day', () => {
    expect(isShopOpenOnDate(hours, new Date('2026-10-06T10:30:00+01:00'))).toBe(false) // Tuesday
    expect(isQuoteFollowupDue({
      ...base,
      quote_sent_at: '2026-10-02T10:00:00+01:00',
      created_at: '2026-10-02T09:00:00+01:00',
    }, hours, new Date('2026-10-06T10:30:00+01:00'))).toBe(false)
    expect(isQuoteFollowupDue({
      ...base,
      quote_sent_at: '2026-10-02T10:00:00+01:00',
      created_at: '2026-10-02T09:00:00+01:00',
    }, hours, new Date('2026-10-07T10:30:00+01:00'))).toBe(true)
  })

  it('prefers quote_sent_at over enquiry creation time', () => {
    const enquiry = {
      ...base,
      created_at: '2026-09-25T10:00:00+01:00',
      quote_sent_at: '2026-09-30T16:30:00+01:00',
    }
    expect(isQuoteFollowupDue(enquiry, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(false)
    expect(isQuoteFollowupDue(enquiry, hours, new Date('2026-10-03T10:30:00+01:00'))).toBe(true)
  })

  it('falls back to enquiry creation time for legacy quotes with no sent timestamp', () => {
    expect(isQuoteFollowupDue({
      ...base,
      quote_sent_at: null,
      created_at: '2026-09-28T10:00:00+01:00',
    }, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(true)
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
      quote_sent_at: '2026-09-01T10:00:00+01:00',
      created_at: '2026-09-01T09:00:00+01:00',
    }, hours, new Date('2026-10-01T10:30:00+01:00'))).toBe(false)
  })
})
