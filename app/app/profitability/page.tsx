'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronRight,
  Home,
  Lightbulb,
  Loader2,
  PoundSterling,
  Save,
  Settings2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  Wrench,
} from 'lucide-react'
import {
  ProfitabilityEntry,
  ProfitabilitySettings,
  dateOffsetKey,
  entryNetProfit,
  monthlyOverhead,
} from '@/lib/profitability'

type ApiData = {
  success: boolean
  today: string
  entries: ProfitabilityEntry[]
  settings: ProfitabilitySettings
  storage: 'supabase_table' | 'admin_settings_fallback'
  overhead: { monthly: number; daily: number }
  reminder: {
    show: boolean
    missing_dates: string[]
    previous_missing: number
    today_missing: boolean
  }
}

type Period = {
  key: 'week' | 'four_weeks' | 'three_months'
  label: string
  short: string
  days: number
}

const PERIODS: Period[] = [
  { key: 'week', label: '1 week', short: '1W', days: 7 },
  { key: 'four_weeks', label: '4 weeks', short: '4W', days: 28 },
  { key: 'three_months', label: '3 months', short: '3M', days: 90 },
]

function money(value: number, decimals = 0) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0)
}

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  })
}

function toInput(value: number | undefined) {
  return value === undefined ? '' : String(value)
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

function summarise(entries: ProfitabilityEntry[]) {
  const revenue = entries.reduce((sum, entry) => sum + entry.revenue, 0)
  const parts = entries.reduce((sum, entry) => sum + entry.parts_cost, 0)
  const petty = entries.reduce((sum, entry) => sum + entry.petty_cash_cost, 0)
  const overhead = entries.reduce((sum, entry) => sum + entry.daily_overhead, 0)
  const jobs = entries.reduce((sum, entry) => sum + entry.job_count, 0)
  const net = revenue - parts - petty - overhead
  const activeDays = entries.length

  return {
    revenue,
    parts,
    petty,
    overhead,
    jobs,
    net,
    activeDays,
    avgRevenue: activeDays ? revenue / activeDays : 0,
    avgNet: activeDays ? net / activeDays : 0,
    avgJobs: activeDays ? jobs / activeDays : 0,
    avgJobValue: jobs ? revenue / jobs : 0,
    partsPct: revenue ? (parts / revenue) * 100 : 0,
  }
}

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string
  value: string
  note?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2 text-gray-500 dark:text-gray-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  )
}

export default function ProfitabilityPage() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCosts, setSavingCosts] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [periodIndex, setPeriodIndex] = useState(0)
  const [insightIndex, setInsightIndex] = useState(0)
  const [showCosts, setShowCosts] = useState(false)

  const [entryDate, setEntryDate] = useState('')
  const [revenue, setRevenue] = useState('')
  const [partsCost, setPartsCost] = useState('')
  const [pettyCashCost, setPettyCashCost] = useState('')
  const [jobCount, setJobCount] = useState('')

  const [rent, setRent] = useState('')
  const [internet, setInternet] = useState('')
  const [water, setWater] = useState('')
  const [electricity, setElectricity] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/profitability?days=120', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.details || json.error || 'Failed to load profitability')
      setData(json)
      if (!entryDate) setEntryDate(json.today)
      setRent(toInput(json.settings.rent_monthly))
      setInternet(toInput(json.settings.internet_monthly))
      setWater(toInput(json.settings.water_monthly))
      setElectricity(toInput(json.settings.electricity_monthly))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load profitability')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!data || !entryDate) return
    const existing = data.entries.find(entry => entry.entry_date === entryDate)
    setRevenue(existing ? toInput(existing.revenue) : '')
    setPartsCost(existing ? toInput(existing.parts_cost) : '')
    setPettyCashCost(existing ? toInput(existing.petty_cash_cost) : '')
    setJobCount(existing ? toInput(existing.job_count) : '')
    setMessage(null)
  }, [entryDate, data])

  const period = PERIODS[periodIndex]

  const { currentEntries, previousEntries, current, previous } = useMemo(() => {
    if (!data) {
      const empty = summarise([])
      return { currentEntries: [], previousEntries: [], current: empty, previous: empty }
    }

    const currentFrom = dateOffsetKey(data.today, -(period.days - 1))
    const previousTo = dateOffsetKey(currentFrom, -1)
    const previousFrom = dateOffsetKey(previousTo, -(period.days - 1))

    const currentRows = data.entries.filter(entry => entry.entry_date >= currentFrom && entry.entry_date <= data.today)
    const previousRows = data.entries.filter(entry => entry.entry_date >= previousFrom && entry.entry_date <= previousTo)

    return {
      currentEntries: currentRows,
      previousEntries: previousRows,
      current: summarise(currentRows),
      previous: summarise(previousRows),
    }
  }, [data, period.days])

  const insights = useMemo(() => {
    if (!data) return ['Add your first day to start building useful trends.']
    if (currentEntries.length === 0) return ['Add a daily entry and I’ll start comparing revenue, profit, jobs and costs automatically.']

    const result: string[] = []
    const revenueChange = pctChange(current.avgRevenue, previous.avgRevenue)
    const profitChange = pctChange(current.avgNet, previous.avgNet)
    const jobsChange = pctChange(current.avgJobs, previous.avgJobs)

    if (revenueChange !== null && previous.activeDays > 0) {
      result.push(
        revenueChange === 0
          ? `Average daily revenue is flat versus the previous ${period.label}.`
          : `Average daily revenue is ${Math.abs(revenueChange)}% ${revenueChange > 0 ? 'higher' : 'lower'} than the previous ${period.label}.`
      )
    }

    if (profitChange !== null && previous.activeDays > 0) {
      result.push(
        profitChange === 0
          ? `Average daily profit is unchanged versus the previous ${period.label}.`
          : `Average daily profit is ${Math.abs(profitChange)}% ${profitChange > 0 ? 'higher' : 'lower'} than the previous ${period.label}.`
      )
    }

    if (jobsChange !== null && previous.activeDays > 0) {
      result.push(
        `Jobs per entered day are ${Math.abs(jobsChange)}% ${jobsChange >= 0 ? 'higher' : 'lower'} than the previous ${period.label}; average job value is ${money(current.avgJobValue)}.`
      )
    } else {
      result.push(`Average job value is ${money(current.avgJobValue)} across ${current.jobs} job${current.jobs === 1 ? '' : 's'} in this view.`)
    }

    result.push(`Parts are using ${current.partsPct.toFixed(1)}% of revenue in this ${period.label} view.`)

    const weekday = new Map<number, { total: number; count: number }>()
    for (const entry of currentEntries) {
      const day = new Date(`${entry.entry_date}T12:00:00Z`).getUTCDay()
      const row = weekday.get(day) || { total: 0, count: 0 }
      row.total += entryNetProfit(entry)
      row.count += 1
      weekday.set(day, row)
    }
    if (weekday.size > 1) {
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const best = [...weekday.entries()]
        .map(([day, row]) => ({ day, avg: row.total / row.count, count: row.count }))
        .sort((a, b) => b.avg - a.avg)[0]
      result.push(`${names[best.day]} is currently the strongest weekday in this view at about ${money(best.avg)} average net profit from ${best.count} entr${best.count === 1 ? 'y' : 'ies'}.`)
    }

    if (data.reminder.missing_dates.length > 0) {
      result.push(`There ${data.reminder.missing_dates.length === 1 ? 'is' : 'are'} ${data.reminder.missing_dates.length} missing trading-day entr${data.reminder.missing_dates.length === 1 ? 'y' : 'ies'} since tracking started.`)
    }

    return result
  }, [data, currentEntries, current, previous, period.label])

  useEffect(() => {
    if (insightIndex >= insights.length) setInsightIndex(0)
  }, [insights.length, insightIndex])

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/profitability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_date: entryDate,
          revenue: Number(revenue || 0),
          parts_cost: Number(partsCost || 0),
          petty_cash_cost: Number(pettyCashCost || 0),
          job_count: Number(jobCount || 0),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to save')
      setMessage('Saved')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveCosts = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingCosts(true)
    setMessage(null)
    try {
      const response = await fetch('/api/profitability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          rent_monthly: Number(rent || 0),
          internet_monthly: Number(internet || 0),
          water_monthly: Number(water || 0),
          electricity_monthly: Number(electricity || 0),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to save costs')
      setMessage('Monthly costs updated')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save costs')
    } finally {
      setSavingCosts(false)
    }
  }

  const formPreview = useMemo(() => {
    if (!data) return { gross: 0, net: 0, averageJob: 0 }
    const rev = Number(revenue || 0)
    const parts = Number(partsCost || 0)
    const petty = Number(pettyCashCost || 0)
    const jobs = Number(jobCount || 0)
    return {
      gross: rev - parts - petty,
      net: rev - parts - petty - data.overhead.daily,
      averageJob: jobs > 0 ? rev / jobs : 0,
    }
  }, [data, revenue, partsCost, pettyCashCost, jobCount])

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href="/app/jobs" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700" title="Repair Jobs">
                <Home className="h-5 w-5 text-primary" />
              </Link>
              <div>
                <h1 className="flex items-center gap-2 text-lg font-black text-gray-900 dark:text-white">
                  <PoundSterling className="h-5 w-5 text-primary" />
                  Profitability
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fast daily numbers, useful trends</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCosts(value => !value)}
              className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${showCosts ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}
            >
              <Settings2 className="h-4 w-4" />
              Costs
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-20">
        {message && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${message === 'Saved' || message.includes('updated') ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
            {message}
          </div>
        )}

        {data?.storage === 'admin_settings_fallback' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <strong>Temporary storage active:</strong> entries are being saved safely in Supabase now, but the dedicated profitability SQL migration has not been applied yet. Once it is run, existing entries are copied across automatically.
          </div>
        )}

        {data?.reminder.missing_dates.length ? (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  {data.reminder.missing_dates.length === 1 ? '1 trading day needs entering' : `${data.reminder.missing_dates.length} trading days need entering`}
                </p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {data.reminder.missing_dates.map(date => (
                    <button
                      type="button"
                      key={date}
                      onClick={() => setEntryDate(date)}
                      className="flex-shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-900 shadow-sm dark:bg-gray-800 dark:text-amber-200"
                    >
                      {prettyDate(date)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showCosts && data && (
          <form onSubmit={saveCosts} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Recurring monthly costs</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Edit these whenever the regular shop bills change. Daily overhead is spread across the normal five trading days each week.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Rent', rent, setRent],
                ['Internet', internet, setInternet],
                ['Water', water, setWater],
                ['Electricity', electricity, setElectricity],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">{label as string}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                    <input
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={value as string}
                      onChange={event => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                      className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-7 pr-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly fixed overhead</p>
                <p className="text-lg font-black text-gray-900 dark:text-white">
                  {money(monthlyOverhead({
                    rent_monthly: Number(rent || 0),
                    internet_monthly: Number(internet || 0),
                    water_monthly: Number(water || 0),
                    electricity_monthly: Number(electricity || 0),
                  }), 2)}
                </p>
              </div>
              <button
                type="submit"
                disabled={savingCosts}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-white disabled:opacity-50"
              >
                {savingCosts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save costs
              </button>
            </div>
          </form>
        )}

        {data && (
          <>
            <form onSubmit={saveEntry} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-gray-900 dark:text-white">Daily entry</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Four numbers. Done.</p>
                </div>
                <input
                  type="date"
                  value={entryDate}
                  max={data.today}
                  onChange={event => setEntryDate(event.target.value)}
                  className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Revenue</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                    <input
                      autoFocus
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={revenue}
                      onChange={event => setRevenue(event.target.value)}
                      className="h-14 w-full rounded-xl border border-gray-300 bg-white pl-7 pr-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Parts cost</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                    <input
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={partsCost}
                      onChange={event => setPartsCost(event.target.value)}
                      className="h-14 w-full rounded-xl border border-gray-300 bg-white pl-7 pr-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Petty / other</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                    <input
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pettyCashCost}
                      onChange={event => setPettyCashCost(event.target.value)}
                      className="h-14 w-full rounded-xl border border-gray-300 bg-white pl-7 pr-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Jobs</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min="0"
                    step="1"
                    value={jobCount}
                    onChange={event => setJobCount(event.target.value)}
                    className="h-14 w-full rounded-xl border border-gray-300 bg-white px-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Gross</p>
                  <p className="font-black text-gray-900 dark:text-white">{money(formPreview.gross)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Overhead</p>
                  <p className="font-black text-gray-900 dark:text-white">{money(data.overhead.daily)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Net</p>
                  <p className={`font-black ${formPreview.net >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{money(formPreview.net)}</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || !entryDate}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-black text-white transition active:scale-[0.99] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Save day
              </button>
            </form>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Performance view</p>
                  <h2 className="font-black text-gray-900 dark:text-white">{period.label}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodIndex(index => (index + 1) % PERIODS.length)
                    setInsightIndex(0)
                  }}
                  className="flex h-11 items-center gap-2 rounded-xl bg-gray-100 px-4 text-sm font-black text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                  title="Tap to change period"
                >
                  {period.short}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Stat icon={<PoundSterling className="h-4 w-4" />} label="Revenue" value={money(current.revenue)} note={`${current.activeDays} days entered`} />
                <Stat icon={<WalletCards className="h-4 w-4" />} label="Net profit" value={money(current.net)} note={`${money(current.avgNet)} / entered day`} />
                <Stat icon={<Wrench className="h-4 w-4" />} label="Jobs" value={String(current.jobs)} note={`${current.avgJobs.toFixed(1)} / entered day`} />
                <Stat icon={<TrendingUp className="h-4 w-4" />} label="Avg job" value={money(current.avgJobValue)} note={`Parts ${current.partsPct.toFixed(1)}% of revenue`} />
              </div>

              <button
                type="button"
                onClick={() => setInsightIndex(index => (index + 1) % insights.length)}
                className="mt-4 w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left dark:border-indigo-800 dark:bg-indigo-900/20"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300">
                    <Lightbulb className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-wide">Insight {insightIndex + 1} of {insights.length}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-500">Tap for next</span>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-indigo-950 dark:text-indigo-100">{insights[insightIndex]}</p>
              </button>

              {previousEntries.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                  {[
                    ['Revenue/day', pctChange(current.avgRevenue, previous.avgRevenue)],
                    ['Profit/day', pctChange(current.avgNet, previous.avgNet)],
                    ['Jobs/day', pctChange(current.avgJobs, previous.avgJobs)],
                  ].map(([label, value]) => (
                    <div key={label as string} className="text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label as string}</p>
                      <div className={`mt-1 flex items-center justify-center gap-1 text-sm font-black ${typeof value === 'number' && value > 0 ? 'text-green-600' : typeof value === 'number' && value < 0 ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
                        {typeof value === 'number' && value > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : typeof value === 'number' && value < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                        {typeof value === 'number' ? `${value > 0 ? '+' : ''}${value}%` : 'new'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-3 text-sm font-black text-gray-900 dark:text-white">Recent days</h2>
              <div className="space-y-2">
                {data.entries.slice(0, 10).map(entry => (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => setEntryDate(entry.entry_date)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3 text-left dark:bg-gray-700/50"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{prettyDate(entry.entry_date)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{entry.job_count} jobs · {money(entry.revenue)} revenue</p>
                    </div>
                    <p className={`text-sm font-black ${entryNetProfit(entry) >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {money(entryNetProfit(entry))}
                    </p>
                  </button>
                ))}
                {data.entries.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-400">No entries yet</p>
                )}
              </div>
            </section>

            <div className="rounded-xl bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Net profit here is a practical workshop estimate: revenue minus parts, petty/other daily costs and the allocated share of recurring overheads. It is not your formal accounting profit or tax figure.
            </div>
          </>
        )}
      </main>
    </div>
  )
}
