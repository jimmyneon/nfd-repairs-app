export const PROFITABILITY_TRACKING_START = '2026-09-26'
export const DEFAULT_TRADING_WEEKDAYS = new Set([1, 3, 4, 5, 6]) // Mon, Wed, Thu, Fri, Sat

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

export type ProfitabilitySettings = {
  id?: string
  rent_monthly: number
  internet_monthly: number
  water_monthly: number
  electricity_monthly: number
}

export type ProfitabilityEntry = {
  id: string
  entry_date: string
  revenue: number
  parts_cost: number
  petty_cash_cost: number
  job_count: number
  daily_overhead: number
  created_at?: string
  updated_at?: string
}

export const PROFITABILITY_REQUIRED_FIELDS = [
  'revenue',
  'parts_cost',
  'petty_cash_cost',
  'job_count',
] as const

export type ProfitabilityRequiredField = typeof PROFITABILITY_REQUIRED_FIELDS[number]

export function missingProfitabilityFields(
  input: Partial<Record<ProfitabilityRequiredField, unknown>>
): ProfitabilityRequiredField[] {
  return PROFITABILITY_REQUIRED_FIELDS.filter(field => {
    const value = input[field]
    return value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
  })
}

export const DEFAULT_PROFITABILITY_SETTINGS: ProfitabilitySettings = {
  rent_monthly: 1300,
  internet_monthly: 40,
  water_monthly: 40,
  electricity_monthly: 150,
}

export function toMoneyNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function monthlyOverhead(settings: ProfitabilitySettings): number {
  return roundMoney(
    toMoneyNumber(settings.rent_monthly) +
    toMoneyNumber(settings.internet_monthly) +
    toMoneyNumber(settings.water_monthly) +
    toMoneyNumber(settings.electricity_monthly)
  )
}

export function tradingWeekdaysFromOpeningHours(value: unknown): Set<number> {
  let parsed: any = value

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return new Set(DEFAULT_TRADING_WEEKDAYS)
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return new Set(DEFAULT_TRADING_WEEKDAYS)
  }

  const result = new Set<number>()
  for (const [day, index] of Object.entries(WEEKDAY_INDEX)) {
    if (parsed?.[day]?.isOpen === true) result.add(index)
  }

  return result.size > 0 ? result : new Set(DEFAULT_TRADING_WEEKDAYS)
}

export function tradingDaysInMonth(
  dateKey: string,
  tradingWeekdays: Set<number> = DEFAULT_TRADING_WEEKDAYS
): number {
  const [year, month] = dateKey.split('-').map(Number)
  if (!year || !month) return 0

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let count = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day, 12))
    if (tradingWeekdays.has(date.getUTCDay())) count++
  }

  return count
}

export function dailyOverhead(
  settings: ProfitabilitySettings,
  dateKey = londonDateKey(),
  tradingWeekdays: Set<number> = DEFAULT_TRADING_WEEKDAYS
): number {
  const tradingDays = tradingDaysInMonth(dateKey, tradingWeekdays)
  return roundMoney(monthlyOverhead(settings) / Math.max(tradingDays, 1))
}

export function londonDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function dateOffsetKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function isTradingDate(
  dateKey: string,
  tradingWeekdays: Set<number> = DEFAULT_TRADING_WEEKDAYS
): boolean {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return tradingWeekdays.has(date.getUTCDay())
}

export function entryNetProfit(entry: Pick<ProfitabilityEntry, 'revenue' | 'parts_cost' | 'petty_cash_cost' | 'daily_overhead'>): number {
  return roundMoney(
    toMoneyNumber(entry.revenue) -
    toMoneyNumber(entry.parts_cost) -
    toMoneyNumber(entry.petty_cash_cost) -
    toMoneyNumber(entry.daily_overhead)
  )
}
