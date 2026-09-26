import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFITABILITY_SETTINGS,
  dailyOverhead,
  dateOffsetKey,
  entryNetProfit,
  isTradingDate,
  missingProfitabilityFields,
  monthlyOverhead,
} from '@/lib/profitability'

describe('profitability helpers', () => {
  it('calculates the seeded monthly overhead', () => {
    expect(monthlyOverhead(DEFAULT_PROFITABILITY_SETTINGS)).toBe(1530)
  })

  it('spreads overhead across five normal trading days per week', () => {
    expect(dailyOverhead(DEFAULT_PROFITABILITY_SETTINGS)).toBe(70.62)
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

  it('calculates practical daily net profit', () => {
    expect(entryNetProfit({
      revenue: 270,
      parts_cost: 65,
      petty_cash_cost: 10,
      daily_overhead: 70.62,
    })).toBe(124.38)
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
