/** Reporting uses UK calendar dates; browser IDs are anonymous, not people. */
export const VISIT_GAP_MS = 30 * 60 * 1000
export const STEP_LABELS = ['Before choosing', 'Category', 'Brand', 'Model', 'Repair', 'Quote details']

export function ukDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function ukMidnight(date: string): Date {
  // At noon the UK offset is unambiguous, including clock-change dates.
  // Resolve midnight iteratively, since its offset can differ from noon.
  const target = Date.parse(`${date}T00:00:00Z`)
  let result = target
  for (let i = 0; i < 3; i++) {
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(result))
    const p = (type: string) => local.find(x => x.type === type)!.value
    const wall = Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`)
    result += target - wall
  }
  return new Date(result)
}
export function reportRange(params: URLSearchParams, now = new Date()) {
  const today = ukDate(now)
  let start = params.get('start') || ''
  let end = params.get('end') || ''
  if (!start && !end) {
    const days = Number(params.get('days') || 7)
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('Choose between 1 and 366 days.')
    end = today
    start = shiftDate(today, 1 - days)
  }
  if (!validDate(start) || !validDate(end) || start > end || end > today) throw new Error('Choose valid From and To dates, ending no later than today.')
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
  if (days > 366) throw new Error('Choose a date range of up to 366 days.')
  return { start, end, days, startISO: ukMidnight(start).toISOString(), endISO: new Date(Math.min(ukMidnight(shiftDate(end, 1)).getTime(), now.getTime())).toISOString(), timezone: 'Europe/London' }
}

export interface QuoteEvent {
  session_id: string
  event_type: string
  event_data?: Record<string, any>
  created_at: string
  [key: string]: any
}
export function visitorOverview(events: QuoteEvent[], range: ReturnType<typeof reportRange>, now = new Date()) {
  const start = Date.parse(range.startISO), end = Date.parse(range.endISO)
  const groups = new Map<string, QuoteEvent[]>()
  for (const event of events) {
    if (!event.session_id || !event.event_type.startsWith('quote_') || event.event_type.startsWith('quote_accept_')) continue
    if (!Number.isFinite(Date.parse(event.created_at)) || Date.parse(event.created_at) >= end) continue
    const group = groups.get(event.session_id) || []
    group.push(event)
    groups.set(event.session_id, group)
  }
  const visits: { id: string; events: QuoteEvent[] }[] = []
  for (const [id, group] of groups) {
    group.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    let current: QuoteEvent[] = []
    for (const event of group) {
      if (current.length && Date.parse(event.created_at) - Date.parse(current[current.length - 1].created_at) >= VISIT_GAP_MS) {
        if (current.some(e => Date.parse(e.created_at) >= start)) visits.push({ id, events: current })
        current = []
      }
      current.push(event)
    }
    if (current.some(e => Date.parse(e.created_at) >= start)) visits.push({ id, events: current })
  }
  const counts = new Map<string, number>()
  const dropSteps = new Map<number, number>()
  const daily = new Map<string, { visitors: Set<string>; visits: number }>()
  for (let day = range.start; day <= range.end; day = shiftDate(day, 1)) daily.set(day, { visitors: new Set(), visits: 0 })
  let submitted = 0, viewedOnly = 0, dropped = 0, active = 0, revealed = 0
  for (const visit of visits) {
    counts.set(visit.id, (counts.get(visit.id) || 0) + 1)
    const inRange = visit.events.filter(e => Date.parse(e.created_at) >= start)
    // A visit spanning midnight belongs to its first activity in the range.
    daily.get(ukDate(new Date(inRange[0].created_at)))!.visits++
    for (const event of inRange) daily.get(ukDate(new Date(event.created_at)))?.visitors.add(visit.id)
    const has = (type: string) => inRange.some(e => e.event_type === type)
    const isRecent = Math.min(now.getTime(), end) - Date.parse(inRange[inRange.length - 1].created_at) < VISIT_GAP_MS
    if (has('quote_reveal')) revealed++
    if (has('quote_form_submit')) submitted++
    else if (isRecent) active++
    else if (has('quote_reveal')) viewedOnly++
    else {
      dropped++
      const steps = inRange.filter(e => e.event_type === 'quote_step_enter').map(e => Number(e.event_data?.step)).filter(n => Number.isInteger(n) && n >= 1 && n <= 5)
      const furthest = Math.max(0, ...steps)
      dropSteps.set(furthest, (dropSteps.get(furthest) || 0) + 1)
    }
  }
  return {
    unique_visitors: counts.size, visits: visits.length,
    repeat_visitors: [...counts.values()].filter(n => n > 1).length,
    repeat_visits: visits.length - counts.size,
    single_visit_visitors: [...counts.values()].filter(n => n === 1).length,
    quote_view_visits: revealed, submitted_visits: submitted,
    viewed_without_submitting: viewedOnly, dropped_before_quote: dropped, recent_unfinished: active,
    drop_off_steps: [...dropSteps].sort((a, b) => a[0] - b[0]).map(([step, count]) => ({ step, label: STEP_LABELS[step], count })),
    daily: [...daily].map(([date, d]) => ({ date, visitors: d.visitors.size, visits: d.visits })),
  }
}
export type VisitorOverview = ReturnType<typeof visitorOverview>

/** Read every page; Supabase otherwise silently limits analytics totals. */
export async function readAllPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data || []))
    if (!data || data.length < 1000) return all
  }
}
