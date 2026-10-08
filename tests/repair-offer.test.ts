import { describe, it, expect } from 'vitest'
import { issueOffer, offerEligible, offerVariant, REPAIR_OFFER, verifyOffer } from '../lib/repair-offer'
import { repairFeedbackAnalytics } from '../lib/repair-feedback-analytics'

const secret = 'test-signing-key'
const now = Date.parse('2026-10-08T12:00:00Z')
const quote = { quoteKey: 'iphone-screen-standard', customerPriceGbp: 100, priceType: 'fixed', enabled: true }
const session = Array.from({ length: 100 }, (_, i) => `s-test-session-${i}`).find(s => offerVariant(s, secret) === 'offer')!

describe('repair offer validation', () => {
  it('signs the selected catalogue price and rejects changed, tampered and expired claims', () => {
    const token = issueOffer(session, quote, secret, now)!
    expect(verifyOffer(token, quote.quoteKey, 100, secret, now)?.session).toBe(session)
    expect(verifyOffer(token + 'x', quote.quoteKey, 100, secret, now)).toBeNull()
    expect(verifyOffer(token, 'another-repair', 100, secret, now)).toBeNull()
    expect(verifyOffer(token, quote.quoteKey, 95, secret, now)).toBeNull()
    expect(verifyOffer(token, quote.quoteKey, 100, 'wrong-key', now)).toBeNull()
    expect(verifyOffer(token, quote.quoteKey, 100, secret, Date.parse(REPAIR_OFFER.expires))).toBeNull()
    expect(verifyOffer('OCT5', quote.quoteKey, 100, secret, now)).toBeNull()
  })
  it('excludes low prices, diagnostics, disabled and nonfixed repairs', () => {
    for (const changes of [{ customerPriceGbp: 74.99 }, { repair: 'diagnostic' }, { enabled: false }, { priceType: 'from' }, { customerPriceGbp: NaN }]) {
      expect(offerEligible({ ...quote, ...changes }, now)).toBe(false)
    }
    expect(offerEligible({ ...quote, customerPriceGbp: 75 }, now)).toBe(true)
    expect(issueOffer(session, quote, secret, Date.parse(REPAIR_OFFER.expires))).toBeNull()
  })
  it('keeps browser allocation stable and issues no token for controls', () => {
    const control = Array.from({ length: 100 }, (_, i) => `s-test-control-${i}`).find(s => offerVariant(s, secret) === 'control')!
    expect(offerVariant(session, secret)).toBe(offerVariant(session, secret))
    expect(issueOffer(control, quote, secret, now)).toBeNull()
  })
})

describe('repair feedback reporting', () => {
  it('deduplicates browser events and links saved requests to actual jobs', () => {
    const event = (session_id: string, event_type: string, extra = {}, enquiry_ref: string | null = null) => ({ session_id, event_type, enquiry_ref,
      created_at: '2026-10-08T12:00:00Z', event_data: { campaign: REPAIR_OFFER.id, eligible: true, variant: session_id === 'control' ? 'control' : 'offer', ...extra } })
    const events = [event('offer', 'repair_feedback_prompt_shown'), event('offer', 'repair_feedback_prompt_shown'),
      event('control', 'repair_feedback_prompt_shown'), event('offer', 'repair_feedback_answer', { reason: 'price' }),
      event('offer', 'repair_discount_claimed'), event('offer', 'repair_discount_claimed'),
      event('offer', 'repair_experiment_request_saved', { discount_applied: true }, 'Q1'),
      event('offer', 'repair_experiment_request_saved', { discount_applied: true }, 'Q1'),
      event('control', 'repair_experiment_request_saved', { discount_applied: false }, 'Q2'),
      event('test', 'repair_feedback_prompt_shown', { test_mode: true }), event('offer', 'repair_quote_left')]
    const report = repairFeedbackAnalytics(events, [{ id: 'E1', enquiry_ref: 'Q1' }, { id: 'E2', enquiry_ref: 'Q2' }],
      [{ id: 'J1', quote_request_id: 'E1', status: 'COLLECTED', price_total: 95, payment_received: true },
        { id: 'J2', quote_request_id: 'E2', status: 'NEW', price_total: 100 }])
    expect(report.prompted).toBe(2)
    expect(report.answers).toBe(1)
    expect(report.observed_exits).toBe(1)
    expect(report.reasons).toEqual([{ reason: 'price', visitors: 1 }])
    expect(report.groups.find(g => g.variant === 'offer')).toMatchObject({ visitors: 1, offers_claimed: 1, requests: 1, arrived: 1, completed: 1, payment_marked: 1, completed_value: 95, completed_discount_cost: 5 })
    expect(report.groups.find(g => g.variant === 'control')).toMatchObject({ visitors: 1, requests: 1, arrived: 0, completed: 0, completed_discount_cost: 0 })
  })
})
