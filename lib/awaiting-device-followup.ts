export type OpeningHoursMap = Record<string, { isOpen?: boolean }>

export type AwaitingDeviceJob = {
  status?: string | null
  source?: string | null
  device_in_shop?: boolean | null
  awaiting_device_followup_at?: string | null
  status_changed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}

const DEFAULT_OPENING_HOURS: OpeningHoursMap = {
  Sunday: { isOpen: false },
  Monday: { isOpen: true },
  Tuesday: { isOpen: false },
  Wednesday: { isOpen: true },
  Thursday: { isOpen: true },
  Friday: { isOpen: true },
  Saturday: { isOpen: true },
}

const ELIGIBLE_STATUSES = new Set(['AWAITING_DEVICE', 'QUOTE_APPROVED', 'PARTS_ARRIVED'])
const ELIGIBLE_SOURCES = new Set(['enquiry_conversion', 'sms_acceptance'])

export function parseOpeningHours(value: unknown): OpeningHoursMap {
  if (!value) return DEFAULT_OPENING_HOURS
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (parsed && typeof parsed === 'object') return parsed as OpeningHoursMap
  } catch {}
  return DEFAULT_OPENING_HOURS
}

function londonDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function dateKeyToUtcNoon(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function weekdayForDateKey(key: string): string {
  return dateKeyToUtcNoon(key).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

function addDays(key: string, days: number): string {
  const date = dateKeyToUtcNoon(key)
  date.setUTCDate(date.getUTCDate() + days)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function countTradingDaysAfter(
  anchorIso: string,
  now: Date,
  openingHours: OpeningHoursMap
): number {
  const anchor = new Date(anchorIso)
  if (Number.isNaN(anchor.getTime())) return 0

  const anchorKey = londonDateKey(anchor)
  const todayKey = londonDateKey(now)
  if (anchorKey >= todayKey) return 0

  let key = addDays(anchorKey, 1)
  let count = 0
  let guard = 0

  while (key <= todayKey && guard < 40) {
    const weekday = weekdayForDateKey(key)
    if (openingHours[weekday]?.isOpen) count++
    key = addDays(key, 1)
    guard++
  }

  return count
}

export function isAwaitingDeviceFollowupDue(
  job: AwaitingDeviceJob,
  openingHours: OpeningHoursMap,
  now = new Date()
): boolean {
  if (!ELIGIBLE_STATUSES.has(String(job.status || ''))) return false
  if (job.device_in_shop) return false
  if (job.awaiting_device_followup_at) return false
  if (!ELIGIBLE_SOURCES.has(String(job.source || ''))) return false

  const anchor = job.status_changed_at || job.updated_at || job.created_at
  if (!anchor) return false

  const anchorDate = new Date(anchor)
  if (Number.isNaN(anchorDate.getTime())) return false

  // Do not resurrect very old abandoned records.
  const ageDays = (now.getTime() - anchorDate.getTime()) / 86_400_000
  if (ageDays < 0 || ageDays > 21) return false

  return countTradingDaysAfter(anchor, now, openingHours) >= 2
}
