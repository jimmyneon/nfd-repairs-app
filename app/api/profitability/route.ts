import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import {
  PROFITABILITY_TRACKING_START,
  ProfitabilitySettings,
  dailyOverhead,
  dateOffsetKey,
  isTradingDate,
  londonDateKey,
} from '@/lib/profitability'
import {
  loadProfitabilityStorage,
  saveProfitabilityEntry,
  saveProfitabilitySettings,
} from '@/lib/profitability-storage'

export const dynamic = 'force-dynamic'

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

function errorMessage(error: any): string {
  return String(error?.message || error?.details || error?.hint || error?.code || error || 'Unknown error')
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

    const { entries, settings, storage } = await loadProfitabilityStorage(supabase, from, today)

    const missingDates = missingTradingDates(entries, today)
    const previousMissing = missingDates.filter(date => date < today)
    const todayMissing = missingDates.includes(today)

    return NextResponse.json({
      success: true,
      today,
      entries,
      settings,
      storage,
      overhead: {
        monthly: settings.rent_monthly + settings.internet_monthly + settings.water_monthly + settings.electricity_monthly,
        daily: dailyOverhead(settings),
      },
      reminder: {
        show: previousMissing.length > 0 || (todayMissing && getLondonHour() >= 16),
        missing_dates: missingDates,
        previous_missing: previousMissing.length,
        today_missing: todayMissing,
      },
    })
  } catch (error: any) {
    console.error('Profitability GET error:', error)
    return NextResponse.json({
      error: 'Failed to load profitability data',
      details: errorMessage(error),
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

      const settings = {
        rent_monthly: rent!,
        internet_monthly: internet!,
        water_monthly: water!,
        electricity_monthly: electricity!,
      }

      const storage = await saveProfitabilitySettings(supabase, settings)

      return NextResponse.json({
        success: true,
        settings,
        storage,
        overhead: {
          monthly: rent! + internet! + water! + electricity!,
          daily: dailyOverhead(settings as ProfitabilitySettings),
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

    const today = londonDateKey()
    const { settings } = await loadProfitabilityStorage(supabase, dateOffsetKey(today, -1), today)
    const entry = {
      entry_date: entryDate,
      revenue,
      parts_cost: partsCost,
      petty_cash_cost: pettyCashCost,
      job_count: jobCount,
      daily_overhead: dailyOverhead(settings),
    }

    const storage = await saveProfitabilityEntry(supabase, entry)

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('title', 'Profitability entry due')
      .eq('is_read', false)

    return NextResponse.json({
      success: true,
      storage,
      entry: {
        id: entryDate,
        ...entry,
      },
    })
  } catch (error: any) {
    console.error('Profitability POST error:', error)
    return NextResponse.json({
      error: 'Failed to save profitability data',
      details: errorMessage(error),
    }, { status: 500 })
  }
}
