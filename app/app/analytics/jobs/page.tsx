'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  PoundSterling,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react'

type BreakdownRow = { label: string; count: number }
type DailyRow = { date: string; count: number; repaired: number; unrepaired: number; value: number }

interface JobAnalyticsData {
  success: boolean
  range: { from: string; to: string; label: string; custom: boolean }
  current: {
    completed: number
    cancelled: number
    repaired: number
    unrepaired: number
    outcome_unknown: number
    fixed_rate: number
    not_fixed_rate: number
    cancellation_rate: number
    completed_job_value: number
    average_job_value: number
    average_turnaround_hours: number
    median_turnaround_hours: number
    warranty_jobs: number
    active_days: number
    average_per_active_day: number
    busiest_day: DailyRow | null
    daily: DailyRow[]
    devices: BreakdownRow[]
    makes: BreakdownRow[]
    repairs: BreakdownRow[]
  }
  previous: {
    completed: number
    fixed_rate: number
    completed_job_value: number
    average_job_value: number
    average_turnaround_hours: number
  }
  change: {
    completed_pct: number
    value_pct: number
    fixed_rate_points: number
  }
}

function money(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatHours(hours: number) {
  if (!hours) return '—'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`
}

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function ChangeBadge({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const positive = value > 0
  const negative = value < 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
      positive ? 'text-green-600 dark:text-green-400' : negative ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
    }`}>
      {positive ? <TrendingUp className="h-3.5 w-3.5" /> : negative ? <TrendingDown className="h-3.5 w-3.5" /> : null}
      {positive ? '+' : ''}{value}{suffix}
    </span>
  )
}

function StatCard({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  note?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      {note && <div className="mt-2">{note}</div>}
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  const max = Math.max(...rows.map(row => row.count), 1)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-4 text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-sm text-gray-400">No data for this period</p>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="truncate text-gray-700 dark:text-gray-300">{row.label}</span>
                <span className="font-semibold text-gray-900 dark:text-white">{row.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max((row.count / max) * 100, 3)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function JobAnalyticsPage() {
  const [preset, setPreset] = useState('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<JobAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = preset === 'custom' && customFrom && customTo
        ? `from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
        : `days=${preset === 'custom' ? 30 : preset}`
      const response = await fetch(`/api/analytics/jobs?${query}`)
      const json = await response.json()
      if (!response.ok) throw new Error(json.details || json.error || 'Failed to load analytics')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [preset, customFrom, customTo])

  useEffect(() => {
    if (preset !== 'custom' || (customFrom && customTo)) fetchData()
  }, [fetchData, preset, customFrom, customTo])

  const maxDaily = useMemo(
    () => Math.max(...(data?.current.daily.map(day => day.count) || [1]), 1),
    [data]
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href="/app" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700">
                <Home className="h-5 w-5 text-primary" />
              </Link>
              <div>
                <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                  <Activity className="h-5 w-5 text-primary" />
                  Job Analytics
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Workshop performance</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/app/analytics"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Quote Analytics
            </Link>
            <select
              value={preset}
              onChange={event => setPreset(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="custom">Custom range</option>
            </select>
            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={event => setCustomFrom(event.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={event => setCustomTo(event.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-20">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {data && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Selected period</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{data.range.label}</p>
              </div>
              <CalendarDays className="h-5 w-5 text-gray-400" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<Wrench className="h-5 w-5" />}
                label="Jobs completed"
                value={data.current.completed}
                note={<ChangeBadge value={data.change.completed_pct} />}
              />
              <StatCard
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Fixed rate"
                value={`${data.current.fixed_rate}%`}
                note={<ChangeBadge value={data.change.fixed_rate_points} suffix=" pts" />}
              />
              <StatCard
                icon={<XCircle className="h-5 w-5" />}
                label="Not fixed"
                value={data.current.unrepaired}
                note={<span className="text-xs text-gray-400">{data.current.not_fixed_rate}% of known outcomes</span>}
              />
              <StatCard
                icon={<PoundSterling className="h-5 w-5" />}
                label="Completed job value"
                value={money(data.current.completed_job_value)}
                note={<ChangeBadge value={data.change.value_pct} />}
              />
              <StatCard
                icon={<BarChart3 className="h-5 w-5" />}
                label="Average job value"
                value={money(data.current.average_job_value)}
              />
              <StatCard
                icon={<Clock3 className="h-5 w-5" />}
                label="Median turnaround"
                value={formatHours(data.current.median_turnaround_hours)}
                note={<span className="text-xs text-gray-400">Avg {formatHours(data.current.average_turnaround_hours)}</span>}
              />
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Day by day</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {data.current.average_per_active_day} jobs per active day
                  </p>
                </div>
                {data.current.busiest_day && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Busiest</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {prettyDate(data.current.busiest_day.date)} · {data.current.busiest_day.count}
                    </p>
                  </div>
                )}
              </div>

              {data.current.daily.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No completed jobs in this period</p>
              ) : (
                <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                  {[...data.current.daily].reverse().map(day => (
                    <div key={day.date}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{prettyDate(day.date)}</span>
                          <span className="ml-2 text-gray-400">{day.repaired} fixed · {day.unrepaired} not fixed</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400">{money(day.value)}</span>
                          <span className="w-5 text-right font-bold text-gray-900 dark:text-white">{day.count}</span>
                        </div>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max((day.count / maxDaily) * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-3 text-sm font-bold text-gray-900 dark:text-white">Repair outcomes</h2>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Fixed</span><strong>{data.current.repaired}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Not fixed</span><strong>{data.current.unrepaired}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Outcome not recorded</span><strong>{data.current.outcome_unknown}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cancelled</span><strong>{data.current.cancelled}</strong></div>
                  <div className="flex justify-between border-t border-gray-100 pt-2.5 dark:border-gray-700">
                    <span className="text-gray-500">Cancellation rate</span>
                    <strong>{data.current.cancellation_rate}%</strong>
                  </div>
                  {data.current.warranty_jobs > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Warranty jobs</span><strong>{data.current.warranty_jobs}</strong></div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-3 text-sm font-bold text-gray-900 dark:text-white">Previous period</h2>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Jobs completed</span><strong>{data.previous.completed}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Fixed rate</span><strong>{data.previous.fixed_rate}%</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Job value</span><strong>{money(data.previous.completed_job_value)}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Average job</span><strong>{money(data.previous.average_job_value)}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Average turnaround</span><strong>{formatHours(data.previous.average_turnaround_hours)}</strong></div>
                </div>
              </section>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Breakdown title="Device types" rows={data.current.devices} />
              <Breakdown title="Repair types" rows={data.current.repairs} />
              <Breakdown title="Top makes" rows={data.current.makes} />
            </div>

            <div className="rounded-xl bg-gray-100 px-4 py-3 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Fixed-rate figures use the existing repair outcome field, so jobs without a recorded outcome are shown separately rather than guessed. “Completed job value” is the total job price recorded on completed/collected repair jobs, not profit.
            </div>
          </>
        )}
      </main>
    </div>
  )
}
