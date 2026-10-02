import { describe, expect, it } from 'vitest'
import { quoteFollowupRecovery } from '../lib/quote-analytics'

describe('quote follow-up recovery analytics', () => {
  it('counts replies, acceptances, arrivals and recovered job value', () => {
    const enquiries = [
      {
        id: 'e1',
        quote_followup_reply_at: '2026-10-03T10:00:00Z',
        proceed_with_repair: true,
        converted_to_job: true,
        converted_job_id: 'j1',
        quoted_price: 65,
      },
      {
        id: 'e2',
        quote_followup_reply_at: null,
        proceed_with_repair: true,
        converted_to_job: true,
        converted_job_id: 'j2',
        quoted_price: 285,
      },
      {
        id: 'e3',
        quote_followup_reply_at: '2026-10-03T11:00:00Z',
        proceed_with_repair: false,
        converted_to_job: false,
        converted_job_id: null,
        quoted_price: 45,
      },
    ]

    const jobs = [
      { id: 'j1', quote_request_id: 'e1', status: 'RECEIVED', device_in_shop: true, price_total: 70 },
      { id: 'j2', quote_request_id: 'e2', status: 'AWAITING_DEVICE', device_in_shop: false, price_total: 285 },
    ]

    expect(quoteFollowupRecovery(enquiries, jobs)).toEqual({
      sent: 3,
      replies: 2,
      accepted: 2,
      arrived: 1,
      recovered_value: 70,
    })
  })

  it('falls back to quoted value when an arrived job has no usable total', () => {
    const result = quoteFollowupRecovery([
      {
        id: 'e1',
        quote_followup_reply_at: null,
        proceed_with_repair: true,
        converted_to_job: true,
        converted_job_id: 'j1',
        quoted_price: 125,
      },
    ], [
      { id: 'j1', quote_request_id: 'e1', status: 'IN_REPAIR', device_in_shop: true, price_total: 0 },
    ])

    expect(result.recovered_value).toBe(125)
    expect(result.arrived).toBe(1)
  })
})
