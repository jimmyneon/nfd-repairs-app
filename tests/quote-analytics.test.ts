import { describe, expect, it } from 'vitest'
import { reportRange, visitorOverview, readAllPages, quoteJobHasDeviceArrived, quoteJobIsCompleted, QuoteEvent } from '../lib/quote-analytics'

const now = new Date('2026-09-08T12:00:00Z')
const range = reportRange(new URLSearchParams('start=2026-09-07&end=2026-09-08'), now)
const event = (id: string, time: string, type = 'quote_step_enter', step = 1): QuoteEvent => ({ session_id: id, created_at: time, event_type: type, event_data: { step } })

describe('UK calendar ranges', () => {
  it('uses UK midnight and includes both dates', () => {
    expect(range.startISO).toBe('2026-09-06T23:00:00.000Z')
    expect(range.days).toBe(2)
    expect(range.endISO).toBe(now.toISOString())
  })
  it('handles both daylight-saving changes', () => {
    for (const [date, hours] of [['2026-03-29', 23], ['2026-10-25', 25]] as const) {
      const r = reportRange(new URLSearchParams({ start: date, end: date }), new Date('2026-12-01'))
      expect((Date.parse(r.endISO) - Date.parse(r.startISO)) / 3600000).toBe(hours)
    }
  })
  it('rejects invalid, reversed, future and oversized dates', () => {
    for (const query of ['start=2026-02-30&end=2026-03-01', 'start=2026-09-08&end=2026-09-07', 'start=2026-09-09&end=2026-09-09', 'days=NaN', 'days=-1', 'days=367', 'start=2026-09-01']) expect(() => reportRange(new URLSearchParams(query), now)).toThrow()
  })
  it('defaults to seven calendar days including today', () => {
    expect(reportRange(new URLSearchParams(), now).start).toBe('2026-09-02')
  })
})

describe('visitor and visit outcomes', () => {
  it('deduplicates clicks but recognises repeat visits from one browser', () => {
    const result = visitorOverview([
      event('a', '2026-09-07T09:00:00Z'), event('a', '2026-09-07T09:01:00Z'),
      event('a', '2026-09-07T10:00:00Z'), event('a', '2026-09-07T10:01:00Z', 'quote_reveal'),
      event('b', '2026-09-08T09:00:00Z', 'quote_form_submit'),
      event('c', '2026-09-08T11:50:00Z'),
      event('accept-only', '2026-09-08T09:00:00Z', 'quote_accept_page_view'),
    ], range, now)
    expect(result).toMatchObject({ unique_visitors: 3, visits: 4, repeat_visitors: 1, repeat_visits: 1, submitted_visits: 1, viewed_without_submitting: 1, dropped_before_quote: 1, recent_unfinished: 1 })
    expect(result.daily.map(d => d.visitors)).toEqual([1, 2])
    expect(result.submitted_visits + result.viewed_without_submitting + result.dropped_before_quote + result.recent_unfinished).toBe(result.visits)
  })
  it('separates a failed visit from a later successful visit by the same browser', () => {
    const result = visitorOverview([
      event('a', '2026-09-07T09:00:00Z', 'quote_step_enter', 4),
      event('a', '2026-09-07T09:01:00Z', 'quote_step_enter', 2),
      event('a', '2026-09-07T10:00:00Z', 'quote_form_submit'),
    ], range, now)
    expect(result.drop_off_steps).toEqual([{ step: 4, label: 'Repair', count: 1 }])
    expect(result.submitted_visits).toBe(1)
  })
  it('handles midnight, out-of-range events and zero-traffic days', () => {
    const r = reportRange(new URLSearchParams('start=2026-09-08&end=2026-09-08'), now)
    const result = visitorOverview([
      event('a', '2026-09-07T22:50:00Z'), event('a', '2026-09-07T23:05:00Z'),
      event('outside', '2026-09-07T22:59:00Z'), event('future', '2026-09-08T12:01:00Z'),
    ], r, now)
    expect(result.unique_visitors).toBe(1)
    expect(result.visits).toBe(1)
    expect(visitorOverview([], range, now).daily).toHaveLength(2)
  })
  it('retains unfinished status at the historical date boundary', () => {
    const r = reportRange(new URLSearchParams('start=2026-09-07&end=2026-09-07'), now)
    expect(visitorOverview([event('a', '2026-09-07T22:50:00Z')], r, now).recent_unfinished).toBe(1)
  })
})

describe('analytics pagination', () => {
  it('reads beyond 1000 rows', async () => {
    const records = Array.from({ length: 2301 }, (_, id) => ({ id }))
    const result = await readAllPages(async (from, to) => ({ data: records.slice(from, to + 1), error: null }))
    expect(result).toEqual(records)
  })
  it('does not hide a failed later page as zero or partial data', async () => {
    await expect(readAllPages(async from => from === 0 ? { data: Array(1000).fill({}), error: null } : { data: null, error: { message: 'Database unavailable' } })).rejects.toThrow('Database unavailable')
  })
})


describe('quote-to-workshop outcomes', () => {
  it('counts current workshop and post-collection statuses as having arrived', () => {
    for (const status of ['DROPPED_OFF', 'RECEIVED', 'DIAGNOSTIC', 'AWAITING_CUSTOMER', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'IN_STORAGE', 'COLLECTED', 'COMPLETED']) {
      expect(quoteJobHasDeviceArrived({ status, device_in_shop: false })).toBe(true)
    }
  })

  it('uses device possession for parts/deposit states and does not count pre-dropoff jobs', () => {
    expect(quoteJobHasDeviceArrived({ status: 'AWAITING_DEVICE', device_in_shop: false })).toBe(false)
    expect(quoteJobHasDeviceArrived({ status: 'PARTS_ORDERED', device_in_shop: false })).toBe(false)
    expect(quoteJobHasDeviceArrived({ status: 'PARTS_ORDERED', device_in_shop: true })).toBe(true)
  })

  it('only treats collected or completed jobs as completed outcomes', () => {
    expect(quoteJobIsCompleted({ status: 'COLLECTED' })).toBe(true)
    expect(quoteJobIsCompleted({ status: 'COMPLETED' })).toBe(true)
    expect(quoteJobIsCompleted({ status: 'READY_TO_COLLECT' })).toBe(false)
  })
})


describe('current website request events', () => {
  it('counts successful repair requests once even with both legacy and new events', () => {
    const result = visitorOverview([
      event('a', '2026-09-07T09:00:00Z', 'quote_reveal'),
      event('a', '2026-09-07T09:01:00Z', 'repair_request_submitted'),
      event('a', '2026-09-07T09:02:00Z', 'quote_form_submit'),
      event('b', '2026-09-07T09:00:00Z', 'repair_request_submitted'),
    ], range, now)
    expect(result.submitted_visits).toBe(2)
    expect(result.viewed_without_submitting).toBe(0)
  })
})
