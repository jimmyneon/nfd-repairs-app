import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import {
  DEFAULT_PROFITABILITY_SETTINGS,
  PROFITABILITY_TRACKING_START,
  ProfitabilitySettings,
  dailyOverhead,
  dateOffsetKey,
  isTradingDate,
  londonDateKey,
  toMoneyNumber,
} from '@/lib/profitability'

export const dynamic = 'force-dynamic'

const SETTINGS_KEY = 'profitability_settings'
const DAY_PREFIX = 'profitability_day_'

function cleanMoney(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000) return null
  return Math.round(parsed * 100) / 100
}

function cleanJobCount(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) return null
  return parsed
}

function parseJson(value: unknown): any {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return null
}

function errorMessage(error: any): string {
  return String(
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.code ||
    error ||
    'Unknown error'
  )
}

async function getSettings(supabase: any): Promise<ProfitabilitySettings> {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  const parsed = parseJson(data?.value)
  if (!parsed) return DEFAULT_PROFITABILITY_SETTINGS

  return {
    rent_monthly: toMoneyNumber(parsed.rent_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.rent_monthly),
    internet_monthly: toMoneyNumber(parsed.internet_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.internet_monthly),
    water_monthly: toMoneyNumber(parsed.water_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.water_monthly),
    electricity_monthly: toMoneyNumber(parsed.electricity_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.electricity_monthly),
  }
}

function getLondonHour(): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()))
}

function missingTradingDates(entries: Array<{ entry_date: string }>, today: string) {
  const present = new Set(entries.map(entry => entry.entry_date))
  const result: string[] = []

  for (let offset = 0; offset >= -20 && result.length < 8; offset--) {
    const key = dateOffsetKey(today, offset)
    if (key < PROFITABILITY_TRACKING_START) break
    if (!isTradingDate(key)) continue
    if (!present.has(key)) result.push(key)
  }

  return result
}

export async function GET(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const supabase = createServiceClient()
    const rawDays = Number(request.nextUrl.searchParams.get('days') || 120)
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.round(rawDays), 14), 400) : 120
    const today = londonDateKey()
    const from = dateOffsetKey(today, -(days - 1))

    const [{ data: rows, error }, settings] = await Promise.all([
      supabase
        .from('admin_settings')
        .select('key,value,updated_at')
        .like('key', `${DAY_PREFIX}%`)
        .order('key', { ascending: false }),
      getSettings(supabase),
    ])

    if (error) throw error

    const entries = (rows || [])
      .map((row: any) => {
        const parsed = parseJson(row.value)
        const entryDate = String(parsed?.entry_date || row.key.replace(DAY_PREFIX, ''))
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null
        return {
          id: row.key,
          entry_date: entryDate,
          revenue: toMoneyNumber(parsed?.revenue),
          parts_cost: toMoneyNumber(parsed?.parts_cost),
          petty_cash_cost: toMoneyNumber(parsed?.petty_cash_cost),
          job_count: Number(parsed?.job_count || 0),
          daily_overhead: toMoneyNumber(parsed?.daily_overhead),
          updated_at: row.updated_at || undefined,
        }
      })
      .filter(Boolean)
      .filter((entry: any) => entry.entry_date >= from && entry.entry_date <= today)
      .sort((a: any, b: any) => b.entry_date.localeCompare(a.entry_date))

    const missingDates = missingTradingDates(entries as any, today)
    const previousMissing = missingDates.filter(date => date < today)
    const todayMissing = missingDates.includes(today)
    const showReminder = previousMissing.length > 0 || (todayMissing && getLondonHour() >= 16)

    return NextResponse.json({
      success: true,
      today,
      entries,
      settings,
      overhead: {
        monthly: settings.rent_monthly + settings.internet_monthly + settings.water_monthly + settings.electricity_monthly,
        daily: dailyOverhead(settings),
      },
      reminder: {
        show: showReminder,
        missing_dates: missingDates,
        previous_missing: previousMissing.length,
        today_missing: todayMissing,
      },
    })
  } catch (error: any) {
    const details = errorMessage(error)
    console.error('Profitability GET error:', error)
    return NextResponse.json({
      error: 'Failed to load profitability data',
      details,
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json()
    const supabase = createServiceClient()

    if (body.action === 'save_settings') {
      const rent = cleanMoney(body.rent_monthly)
      const internet = cleanMoney(body.internet_monthly)
      const water = cleanMoney(body.water_monthly)
      const electricity = cleanMoney(body.electricity_monthly)
      if ([rent, internet, water, electricity].some(value => value === null)) {
        return NextResponse.json({ error: 'Enter valid monthly costs' }, { status: 400 })
      }

      const payload = {
        rent_monthly: rent,
        internet_monthly: internet,
        water_monthly: water,
        electricity_monthly: electricity,
      }

      const { error } = await supabase.from('admin_settings').upsert({
        key: SETTINGS_KEY,
        value: payload,
        description: 'Recurring monthly costs used by the profitability tracker',
      }, { onConflict: 'key' })

      if (error) throw error

      return NextResponse.json({
        success: true,
        settings: payload,
        overhead: {
          monthly: rent! + internet! + water! + electricity!,
          daily: dailyOverhead(payload as ProfitabilitySettings),
        },
      })
    }

    const entryDate = String(body.entry_date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || entryDate < PROFITABILITY_TRACKING_START) {
      return NextResponse.json({ error: 'Invalid entry date' }, { status: 400 })
    }

    const revenue = cleanMoney(body.revenue)
    const partsCost = cleanMoney(body.parts_cost)
    const pettyCashCost = cleanMoney(body.petty_cash_cost)
    const jobCount = cleanJobCount(body.job_count)

    if (revenue === null || partsCost === null || pettyCashCost === null || jobCount === null) {
      return NextResponse.json({ error: 'Enter valid non-negative figures' }, { status: 400 })
    }

    const settings = await getSettings(supabase)
    const payload = {
      entry_date: entryDate,
      revenue,
      parts_cost: partsCost,
      petty_cash_cost: pettyCashCost,
      job_count: jobCount,
      daily_overhead: dailyOverhead(settings),
    }

    const key = `${DAY_PREFIX}${entryDate}`
    const { error } = await supabase.from('admin_settings').upsert({
      key,
      value: payload,
      description: `Profitability entry for ${entryDate}`,
    }, { onConflict: 'key' })

    if (error) throw error

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('title', 'Profitability entry due')
      .eq('is_read', false)

    return NextResponse.json({
      success: true,
      entry: {
        id: key,
        ...payload,
      },
    })
  } catch (error: any) {
    const details = errorMessage(error)
    console.error('Profitability POST error:', error)
    return NextResponse.json({
      error: 'Failed to save profitability data',
      details,
    }, { status: 500 })
  }
}
