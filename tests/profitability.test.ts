import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFITABILITY_SETTINGS,
  dailyOverhead,
  dateOffsetKey,
  entryCashAdvanceRepayment,
  entryCashAfterAdvance,
  entryNetProfit,
  entrySumUpFee,
  isTradingDate,
  missingProfitabilityFields,
  monthlyOverhead,
  tradingDaysInMonth,
  tradingWeekdaysFromOpeningHours,
} from '@/lib/profitability'

describe('profitability helpers', () => {
  it('calculates the seeded monthly overhead', () => {
    expect(monthlyOverhead(DEFAULT_PROFITABILITY_SETTINGS)).toBe(1530)
  })

  it('spreads monthly overhead across the actual configured trading dates in that month', () => {
    expect(tradingDaysInMonth('2026-09-30')).toBe(21)
    expect(dailyOverhead(DEFAULT_PROFITABILITY_SETTINGS, '2026-09-30')).toBe(72.86)
    expect(tradingDaysInMonth('2026-10-01')).toBe(23)
    expect(dailyOverhead(DEFAULT_PROFITABILITY_SETTINGS, '2026-10-01')).toBe(66.52)
  })

  it('derives trading weekdays from the saved opening-hours structure', () => {
    const tradingWeekdays = tradingWeekdaysFromOpeningHours({
      Sunday: { isOpen: false },
      Monday: { isOpen: true },
      Tuesday: { isOpen: false },
      Wednesday: { isOpen: true },
      Thursday: { isOpen: true },
      Friday: { isOpen: true },
      Saturday: { isOpen: true },
    })

    expect([...tradingWeekdays].sort()).toEqual([1, 3, 4, 5, 6])
    expect(isTradingDate('2026-09-29', tradingWeekdays)).toBe(false)
  })

  it('recognises the shop trading days', () => {
    expect(isTradingDate('2026-09-26')).toBe(true) // Saturday
    expect(isTradingDate('2026-09-27')).toBe(false) // Sunday
    expect(isTradingDate('2026-09-28')).toBe(true) // Monday
    expect(isTradingDate('2026-09-29')).toBe(false) // Tuesday
  })

  it('moves date-only values without timezone drift', () => {
    expect(dateOffsetKey('2026-09-26', -7)).toBe('2026-09-19')
  })

  it('calculates SumUp fee, operating profit and cash after the advance repayment', () => {
    const entry = {
      revenue: 270,
      parts_cost: 65,
      petty_cash_cost: 10,
      daily_overhead: 70.62,
      sumup_takings: 200,
      sumup_fee_percent: 0.99,
      cash_advance_percent: 15,
    }

    expect(entrySumUpFee(entry)).toBe(1.98)
    expect(entryCashAdvanceRepayment(entry)).toBe(30)
    expect(entryNetProfit(entry)).toBe(122.4)
    expect(entryCashAfterAdvance(entry)).toBe(92.4)
  })

  it('requires every daily field to be explicitly entered while allowing zero', () => {
    expect(missingProfitabilityFields({
      revenue: '270',
      parts_cost: '',
      petty_cash_cost: '0',
      job_count: 0,
    })).toEqual(['parts_cost'])

    expect(missingProfitabilityFields({
      revenue: 0,
      parts_cost: 0,
      petty_cash_cost: 0,
      job_count: 0,
    })).toEqual([])
  })
})
