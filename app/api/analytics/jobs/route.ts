import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type JobRow = {
  id: string
  status: string
  type: string | null
  price_total: number | string | null
  repair_outcome: 'repaired' | 'unrepaired' | null
  device_type: string | null
  device_make: string | null
  repair_type: string | null
  created_at: string
  updated_at: string
  collected_at: string | null
  closed_at: string | null
  status_changed_at: string | null
  is_warranty: boolean | null
}

const FINAL_STATUSES = new Set(['COLLECTED', 'COMPLETED'])
const PAGE_SIZE = 1000
const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function effectiveDate(job: JobRow): Date {
  const value = job.closed_at || job.collected_at || job.status_changed_at || job.updated_at
  return new Date(value)
}

function dayKey(date: Date): string {
  return LONDON_DATE.format(date)
}

function money(value: number | string | null): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function round(value: number, places = 1): number {
  const factor = Math.pow(10, places)
  return Math.round(value * factor) / factor
}

function topCounts(values: Array<string | null>, limit = 8) {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = raw?.trim()
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))
}

function summarise(jobs: JobRow[]) {
  const completed = jobs.filter(job => FINAL_STATUSES.has(job.status))
  const cancelled = jobs.filter(job => job.status === 'CANCELLED')
  const repaired = completed.filter(job => job.repair_outcome === 'repaired')
  const unrepaired = completed.filter(job => job.repair_outcome === 'unrepaired')
  const outcomeKnown = repaired.length + unrepaired.length
  const value = completed.reduce((sum, job) => sum + money(job.price_total), 0)

  const turnaroundHours = completed
    .map(job => {
      const start = new Date(job.created_at).getTime()
      const end = effectiveDate(job).getTime()
      return (end - start) / 3600000
    })
    .filter(hours => Number.isFinite(hours) && hours >= 0)

  const dailyMap = new Map<string, { count: number; repaired: number; unrepaired: number; value: number }>()
  for (const job of completed) {
    const key = dayKey(effectiveDate(job))
    const current = dailyMap.get(key) || { count: 0, repaired: 0, unrepaired: 0, value: 0 }
    current.count += 1
    current.value += money(job.price_total)
    if (job.repair_outcome === 'repaired') current.repaired += 1
    if (job.repair_outcome === 'unrepaired') current.unrepaired += 1
    dailyMap.set(key, current)
  }

  const daily = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({
      date,
      ...values,
      value: round(values.value, 2),
    }))

  const busiestDay = daily.length
    ? daily.reduce((best, row) => row.count > best.count ? row : best, daily[0])
    : null

  return {
    completed: completed.length,
    cancelled: cancelled.length,
    repaired: repaired.length,
    unrepaired: unrepaired.length,
    outcome_unknown: completed.length - outcomeKnown,
    fixed_rate: outcomeKnown > 0 ? round((repaired.length / outcomeKnown) * 100) : 0,
    not_fixed_rate: outcomeKnown > 0 ? round((unrepaired.length / outcomeKnown) * 100) : 0,
    cancellation_rate: completed.length + cancelled.length > 0
      ? round((cancelled.length / (completed.length + cancelled.length)) * 100)
      : 0,
    completed_job_value: round(value, 2),
    average_job_value: completed.length > 0 ? round(value / completed.length, 2) : 0,
    average_turnaround_hours: turnaroundHours.length > 0
      ? round(turnaroundHours.reduce((sum, hours) => sum + hours, 0) / turnaroundHours.length)
      : 0,
    median_turnaround_hours: round(median(turnaroundHours)),
    warranty_jobs: completed.filter(job => job.is_warranty).length,
    active_days: daily.length,
    average_per_active_day: daily.length > 0 ? round(completed.length / daily.length) : 0,
    busiest_day: busiestDay,
    daily,
    devices: topCounts(completed.map(job => job.device_type)),
    makes: topCounts(completed.map(job => job.device_make)),
    repairs: topCounts(completed.map(job => job.repair_type)),
  }
}

function parseRange(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')

  if (from && to) {
    const start = new Date(`${from}T00:00:00.000Z`)
    const end = new Date(`${to}T23:59:59.999Z`)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      return { start, end, label: `${from} to ${to}`, custom: true }
    }
  }

  const rawDays = Number(params.get('days') || 30)
  const days = [7, 30, 90, 365].includes(rawDays) ? rawDays : 30
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return { start, end, label: `Last ${days} days`, custom: false }
}

async function fetchAllJobs(supabase: ReturnType<typeof createClient>): Promise<JobRow[]> {
  const rows: JobRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,status,type,price_total,repair_outcome,device_type,device_make,repair_type,created_at,updated_at,collected_at,closed_at,status_changed_at,is_warranty')
      .in('status', ['COLLECTED', 'COMPLETED', 'CANCELLED'])
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const batch = (data || []) as JobRow[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error', details: 'Missing Supabase environment variables' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { start, end, label, custom } = parseRange(request)
    const durationMs = end.getTime() - start.getTime() + 1
    const previousEnd = new Date(start.getTime() - 1)
    const previousStart = new Date(previousEnd.getTime() - durationMs + 1)

    const allJobs = await fetchAllJobs(supabase)
    const repairJobs = allJobs.filter(job => (job.type || 'repair') === 'repair')

    const inRange = (job: JobRow, rangeStart: Date, rangeEnd: Date) => {
      const date = effectiveDate(job)
      return date >= rangeStart && date <= rangeEnd
    }

    const currentJobs = repairJobs.filter(job => inRange(job, start, end))
    const previousJobs = repairJobs.filter(job => inRange(job, previousStart, previousEnd))

    const current = summarise(currentJobs)
    const previous = summarise(previousJobs)

    return NextResponse.json({
      success: true,
      range: {
        from: start.toISOString(),
        to: end.toISOString(),
        label,
        custom,
      },
      current,
      previous: {
        completed: previous.completed,
        fixed_rate: previous.fixed_rate,
        completed_job_value: previous.completed_job_value,
        average_job_value: previous.average_job_value,
        average_turnaround_hours: previous.average_turnaround_hours,
      },
      change: {
        completed_pct: previous.completed > 0
          ? round(((current.completed - previous.completed) / previous.completed) * 100)
          : current.completed > 0 ? 100 : 0,
        value_pct: previous.completed_job_value > 0
          ? round(((current.completed_job_value - previous.completed_job_value) / previous.completed_job_value) * 100)
          : current.completed_job_value > 0 ? 100 : 0,
        fixed_rate_points: round(current.fixed_rate - previous.fixed_rate),
      },
    })
  } catch (error) {
    console.error('Job analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to load job analytics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
