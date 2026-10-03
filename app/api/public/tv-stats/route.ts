import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const HISTORIC_REPAIR_BASE = 10000
const PAGE_SIZE = 1000
const FINAL_STATUSES = new Set(['COLLECTED', 'COMPLETED'])
const EXCLUDED_ACTIVE_STATUSES = new Set(['COLLECTED', 'COMPLETED', 'CANCELLED', 'IN_STORAGE'])

type JobRow = {
  id: string
  status: string
  type: string | null
  device_type: string | null
  created_at: string
  updated_at: string
  collected_at: string | null
  closed_at: string | null
  status_changed_at: string | null
  device_in_shop: boolean | null
}

function effectiveDate(job: JobRow): Date {
  return new Date(job.closed_at || job.collected_at || job.status_changed_at || job.updated_at)
}

function median(values: number[]): number | null {
  const clean = values.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  if (!clean.length) return null
  const mid = Math.floor(clean.length / 2)
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2
}

function round(value: number, places = 1): number {
  const p = Math.pow(10, places)
  return Math.round(value * p) / p
}

function londonDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function categoryFor(deviceType: string | null): 'phone' | 'tablet' | 'laptop' | 'console' | 'other' {
  const value = (deviceType || '').toLowerCase()
  if (value.includes('phone') || value.includes('iphone') || value.includes('smartphone') || value.includes('mobile')) return 'phone'
  if (value.includes('tablet') || value.includes('ipad')) return 'tablet'
  if (value.includes('laptop') || value.includes('macbook') || value.includes('computer') || value.includes('pc')) return 'laptop'
  if (value.includes('console') || value.includes('playstation') || value.includes('ps5') || value.includes('xbox') || value.includes('switch')) return 'console'
  return 'other'
}

async function fetchAllJobs(supabase: any): Promise<JobRow[]> {
  const rows: JobRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,status,type,device_type,created_at,updated_at,collected_at,closed_at,status_changed_at,device_in_shop')
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const allJobs = await fetchAllJobs(supabase)
    const repairJobs = allJobs.filter(job => (job.type || 'repair') === 'repair')
    const completed = repairJobs.filter(job => FINAL_STATUSES.has(job.status))

    const now = new Date()
    const todayKey = londonDayKey(now)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000)

    const completedToday = completed.filter(job => londonDayKey(effectiveDate(job)) === todayKey).length
    const completed7d = completed.filter(job => effectiveDate(job) >= sevenDaysAgo).length
    const completed30d = completed.filter(job => effectiveDate(job) >= thirtyDaysAgo).length

    const active = repairJobs.filter(job =>
      !EXCLUDED_ACTIVE_STATUSES.has(job.status) &&
      (job.device_in_shop || ['READY_TO_COLLECT', 'PARTS_ORDERED', 'AWAITING_CUSTOMER'].includes(job.status))
    )

    const recentCompleted = completed.filter(job => effectiveDate(job) >= ninetyDaysAgo)
    const turnaroundHours = recentCompleted
      .map(job => (effectiveDate(job).getTime() - new Date(job.created_at).getTime()) / 3600000)
      .filter(hours => Number.isFinite(hours) && hours >= 0 && hours < 24 * 120)

    const byCategory: Record<string, number[]> = {
      phone: [],
      tablet: [],
      laptop: [],
      console: [],
    }

    for (const job of recentCompleted) {
      const category = categoryFor(job.device_type)
      if (!(category in byCategory)) continue
      const hours = (effectiveDate(job).getTime() - new Date(job.created_at).getTime()) / 3600000
      if (Number.isFinite(hours) && hours >= 0 && hours < 24 * 120) byCategory[category].push(hours)
    }

    const medianByCategory = Object.fromEntries(
      Object.entries(byCategory).map(([category, hours]) => {
        const value = median(hours)
        return [category, value === null ? null : round(value)]
      })
    )

    const trackedCompleted = completed.length
    const estimatedTotalRepaired = HISTORIC_REPAIR_BASE + trackedCompleted

    return NextResponse.json({
      success: true,
      updated_at: now.toISOString(),
      repairs: {
        historic_base: HISTORIC_REPAIR_BASE,
        tracked_completed: trackedCompleted,
        estimated_total: estimatedTotalRepaired,
        completed_today: completedToday,
        completed_7d: completed7d,
        completed_30d: completed30d,
      },
      workshop: {
        active_jobs: active.length,
        diagnosing: active.filter(job => ['RECEIVED', 'DIAGNOSTIC'].includes(job.status)).length,
        repairing: active.filter(job => ['IN_REPAIR', 'PARTS_ARRIVED', 'TESTING'].includes(job.status)).length,
        parts_ordered: active.filter(job => job.status === 'PARTS_ORDERED').length,
        ready_to_collect: active.filter(job => job.status === 'READY_TO_COLLECT').length,
      },
      recent_turnaround: {
        period_days: 90,
        median_hours: median(turnaroundHours) === null ? null : round(median(turnaroundHours)!),
        by_category_hours: medianByCategory,
        sample_size: turnaroundHours.length,
      },
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('TV stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load TV stats' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
