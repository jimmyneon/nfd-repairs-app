import { describe, expect, it } from 'vitest'
import { countTradingDaysAfter, isAwaitingDeviceFollowupDue, parseOpeningHours } from '../lib/awaiting-device-followup'

const hours = parseOpeningHours(JSON.stringify({
  Sunday: { isOpen: false },
  Monday: { isOpen: true },
  Tuesday: { isOpen: false },
  Wednesday: { isOpen: true },
  Thursday: { isOpen: true },
  Friday: { isOpen: true },
  Saturday: { isOpen: true },
}))

describe('awaiting-device follow-up timing', () => {
  it('counts only trading days after the customer entered the waiting state', () => {
    const anchor = '2026-09-28T10:00:00+01:00' // Monday
    expect(countTradingDaysAfter(anchor, new Date('2026-09-30T10:15:00+01:00'), hours)).toBe(1)
    expect(countTradingDaysAfter(anchor, new Date('2026-10-01T10:15:00+01:00'), hours)).toBe(2)
  })

  it('handles weekends and closed Tuesdays', () => {
    const anchor = '2026-09-25T16:00:00+01:00' // Friday
    expect(countTradingDaysAfter(anchor, new Date('2026-09-28T10:15:00+01:00'), hours)).toBe(2) // Sat + Mon
  })

  it('only follows up once for accepted quote-origin jobs still waiting for the device', () => {
    const base = {
      status: 'AWAITING_DEVICE',
      source: 'enquiry_conversion',
      device_in_shop: false,
      status_changed_at: '2026-09-28T10:00:00+01:00',
      created_at: '2026-09-28T10:00:00+01:00',
      awaiting_device_followup_at: null,
    }

    expect(isAwaitingDeviceFollowupDue(base, hours, new Date('2026-10-01T10:15:00+01:00'))).toBe(true)
    expect(isAwaitingDeviceFollowupDue({ ...base, device_in_shop: true }, hours, new Date('2026-10-01T10:15:00+01:00'))).toBe(false)
    expect(isAwaitingDeviceFollowupDue({ ...base, awaiting_device_followup_at: '2026-10-01T09:00:00Z' }, hours, new Date('2026-10-01T10:15:00+01:00'))).toBe(false)
    expect(isAwaitingDeviceFollowupDue({ ...base, source: 'staff_manual' }, hours, new Date('2026-10-01T10:15:00+01:00'))).toBe(false)
  })

  it('does not revive abandoned records older than the recovery window', () => {
    expect(isAwaitingDeviceFollowupDue({
      status: 'QUOTE_APPROVED',
      source: 'sms_acceptance',
      device_in_shop: false,
      created_at: '2026-08-01T10:00:00+01:00',
      status_changed_at: '2026-08-01T10:00:00+01:00',
      awaiting_device_followup_at: null,
    }, hours, new Date('2026-10-01T10:15:00+01:00'))).toBe(false)
  })
})
