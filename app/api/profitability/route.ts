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

async function getSettings(supabase: any): Promise<ProfitabilitySettings> {
  const { data } = await supabase
    .from('profitability_settings')
    .select('id,rent_monthly,internet_monthly,water_monthly,electricity_monthly')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return DEFAULT_PROFITABILITY_SETTINGS

  return {
    id: data.id,
    rent_monthly: toMoneyNumber(data.rent_monthly),
    internet_monthly: toMoneyNumber(data.internet_monthly),
    water_monthly: toMoneyNumber(data.water_monthly),
    electricity_monthly: toMoneyNumber(data.electricity_monthly),
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
        .from('daily_profitability')
        .select('id,entry_date,revenue,parts_cost,petty_cash_cost,job_count,daily_overhead,created_at,updated_at')
        .gte('entry_date', from)
        .lte('entry_date', today)
        .order('entry_date', { ascending: false }),
      getSettings(supabase),
    ])

    if (error) throw error

    const entries = (rows || []).map((row: any) => ({
      ...row,
      revenue: toMoneyNumber(row.revenue),
      parts_cost: toMoneyNumber(row.parts_cost),
      petty_cash_cost: toMoneyNumber(row.petty_cash_cost),
      job_count: Number(row.job_count || 0),
      daily_overhead: toMoneyNumber(row.daily_overhead),
    }))

    const missingDates = missingTradingDates(entries, today)
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
  } catch (error) {
    console.error('Profitability GET error:', error)
    return NextResponse.json({
      error: 'Failed to load profitability data',
      details: error instanceof Error ? error.message : 'Unknown error',
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

      const current = await getSettings(supabase)
      const payload = {
        rent_monthly: rent,
        internet_monthly: internet,
        water_monthly: water,
        electricity_monthly: electricity,
      }

      const query = current.id
        ? supabase.from('profitability_settings').update(payload).eq('id', current.id)
        : supabase.from('profitability_settings').insert(payload)

      const { error } = await query
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

    const { data, error } = await supabase
      .from('daily_profitability')
      .upsert(payload, { onConflict: 'entry_date' })
      .select('id,entry_date,revenue,parts_cost,petty_cash_cost,job_count,daily_overhead,created_at,updated_at')
      .single()

    if (error) throw error

    // Saving an entry resolves any profitability reminder currently sitting in the inbox.
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('title', 'Profitability entry due')
      .eq('is_read', false)

    return NextResponse.json({
      success: true,
      entry: {
        ...data,
        revenue: toMoneyNumber(data.revenue),
        parts_cost: toMoneyNumber(data.parts_cost),
        petty_cash_cost: toMoneyNumber(data.petty_cash_cost),
        job_count: Number(data.job_count || 0),
        daily_overhead: toMoneyNumber(data.daily_overhead),
      },
    })
  } catch (error) {
    console.error('Profitability POST error:', error)
    return NextResponse.json({
      error: 'Failed to save profitability data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
