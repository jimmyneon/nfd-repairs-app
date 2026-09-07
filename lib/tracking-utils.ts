/**
 * Turnaround time estimates, visit frequency messaging, and progress bar logic
 * for the customer tracking page.
 *
 * All turnaround times are deliberately under-promised based on real job data.
 */

export interface TurnaroundEstimate {
  /** Human-readable range, e.g. "1–3 hours" */
  display: string
  /** Minimum hours for progress bar calculation */
  minHours: number
  /** Maximum hours for progress bar calculation */
  maxHours: number
  /** True if this is a complex/long repair */
  isComplex: boolean
}

/**
 * Detect device type from make/model fields.
 */
export function getDeviceType(
  deviceMake: string,
  deviceModel: string
): 'phone' | 'tablet' | 'laptop' | 'console' | 'watch' | 'other' {
  const combined = `${deviceMake} ${deviceModel}`.toLowerCase()

  if (
    combined.includes('iphone') ||
    combined.includes('samsung') && !combined.includes('tab') && !combined.includes('book') ||
    combined.includes('pixel') ||
    combined.includes('oneplus') ||
    combined.includes('huawei') && !combined.includes('tab') ||
    combined.includes('xiaomi') && !combined.includes('pad') ||
    combined.includes('motorola') ||
    combined.includes('nokia') ||
    combined.includes('oppo') ||
    combined.includes('sony') && !combined.includes('playstation') && !combined.includes('ps') ||
    combined.includes('smartphone') ||
    combined.includes('phone')
  ) {
    return 'phone'
  }

  if (
    combined.includes('ipad') ||
    combined.includes('tablet') ||
    combined.includes('tab ') ||
    combined.includes('galaxy tab')
  ) {
    return 'tablet'
  }

  if (
    combined.includes('macbook') ||
    combined.includes('laptop') ||
    combined.includes('notebook') ||
    combined.includes('chromebook') ||
    combined.includes('lenovo') && !combined.includes('phone') ||
    combined.includes('dell') ||
    combined.includes('hp') && !combined.includes('phone') ||
    combined.includes('asus') && !combined.includes('phone') ||
    combined.includes('acer') ||
    combined.includes('air ')
  ) {
    return 'laptop'
  }

  if (
    combined.includes('playstation') ||
    combined.includes('xbox') ||
    combined.includes('nintendo') ||
    combined.includes('switch') ||
    combined.includes('ps4') ||
    combined.includes('ps5') ||
    combined.includes('console')
  ) {
    return 'console'
  }

  if (combined.includes('watch') || combined.includes('fitbit')) {
    return 'watch'
  }

  return 'other'
}

/**
 * Check if the issue text indicates a motherboard/logic board/no power repair.
 */
function isComplexIssue(issue: string): boolean {
  const i = (issue || '').toLowerCase()
  return (
    i.includes('motherboard') ||
    i.includes('logic board') ||
    i.includes('logicboard') ||
    i.includes('no power') ||
    i.includes('not turning on') ||
    i.includes('not turning on') ||
    i.includes('wont turn on') ||
    i.includes("won't turn on") ||
    i.includes('water damage') ||
    i.includes('liquid damage') ||
    i.includes('data recovery') ||
    i.includes('short circuit') ||
    i.includes('charging ic') ||
    i.includes('tristar') ||
    i.includes('u2 ic')
  )
}

/**
 * Get turnaround estimate for a job based on device type and issue.
 *
 * Base estimates reflect realistic bench time for each specific repair type,
 * deliberately under-promised (we say "40–60 minutes" for a 30-min job).
 *
 * minHours/maxHours are used for progress bar and workload calculations.
 * For sub-hour repairs, minHours/maxHours are in fractional hours (0.5 = 30min).
 */
export function getTurnaroundEstimate(
  deviceMake: string,
  deviceModel: string,
  issue: string,
  _status: string
): TurnaroundEstimate {
  const deviceType = getDeviceType(deviceMake, deviceModel)
  const issueLower = (issue || '').toLowerCase()
  const complex = isComplexIssue(issue)

  // Complex repairs — long turnaround regardless of device
  if (complex) {
    if (issueLower.includes('data recovery')) {
      return { display: 'Usually up to 7 days — we want to make sure we recover everything safely, and quite often we get it back to you quicker', minHours: 72, maxHours: 168, isComplex: true }
    }
    if (deviceType === 'laptop') {
      return { display: 'Usually up to 10 days, but quite often we get it back to you quicker than that', minHours: 96, maxHours: 240, isComplex: true }
    }
    return { display: 'Usually up to 7 days, but quite often we get it back to you quicker than that', minHours: 72, maxHours: 168, isComplex: true }
  }

  // Phone repairs — realistic bench times
  if (deviceType === 'phone') {
    if (issueLower.includes('battery')) {
      return { display: 'Around 30–60 minutes', minHours: 0.5, maxHours: 1, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display') || issueLower.includes('lcd') || issueLower.includes('oled')) {
      return { display: 'Around 45–90 minutes', minHours: 0.75, maxHours: 1.5, isComplex: false }
    }
    if (issueLower.includes('charging port') || issueLower.includes('charging')) {
      return { display: 'Around 45–90 minutes', minHours: 0.75, maxHours: 1.5, isComplex: false }
    }
    if (issueLower.includes('camera')) {
      return { display: 'Around 30–60 minutes', minHours: 0.5, maxHours: 1, isComplex: false }
    }
    if (issueLower.includes('speaker') || issueLower.includes('microphone') || issueLower.includes('audio')) {
      return { display: 'Around 45–90 minutes', minHours: 0.75, maxHours: 1.5, isComplex: false }
    }
    if (issueLower.includes('back glass') || issueLower.includes('back cover')) {
      return { display: 'Around 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
    }
    if (issueLower.includes('virus') || issueLower.includes('software') || issueLower.includes('reset') || issueLower.includes('restore') || issueLower.includes('setup')) {
      return { display: 'Around 30–60 minutes', minHours: 0.5, maxHours: 1, isComplex: false }
    }
    if (issueLower.includes('glue') || issueLower.includes('back on')) {
      return { display: 'Around 30–60 minutes', minHours: 0.5, maxHours: 1, isComplex: false }
    }
    // Phone — other/unknown
    return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
  }

  // Tablet / iPad repairs
  if (deviceType === 'tablet') {
    if (issueLower.includes('battery')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display')) {
      return { display: 'Around 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
    }
    if (issueLower.includes('charging')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('reset') || issueLower.includes('restore') || issueLower.includes('software') || issueLower.includes('transfer') || issueLower.includes('photos')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    // Tablet — other/unknown
    return { display: 'Usually 1–3 working days', minHours: 24, maxHours: 72, isComplex: false }
  }

  // Laptop repairs
  if (deviceType === 'laptop') {
    if (issueLower.includes('battery')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('keyboard')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('software') || issueLower.includes('windows') || issueLower.includes('os') || issueLower.includes('virus') || issueLower.includes('reinstall') || issueLower.includes('outlook') || issueLower.includes('word') || issueLower.includes('email') || issueLower.includes('compatib')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('sound') || issueLower.includes('speaker') || issueLower.includes('audio')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('no display') || issueLower.includes('not displaying')) {
      return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('slow')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    // Laptop — other/unknown
    return { display: 'Usually 1–3 working days', minHours: 24, maxHours: 72, isComplex: false }
  }

  // Console repairs
  if (deviceType === 'console') {
    if (issueLower.includes('hdmi')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('overheat')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('disc') || issueLower.includes('drive')) {
      return { display: 'Usually 1–2 working days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('controller') || issueLower.includes('stick') || issueLower.includes('drift') || issueLower.includes('button')) {
      return { display: 'Around 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
    }
    // Console — other/unknown
    return { display: 'Usually 1–3 working days', minHours: 24, maxHours: 72, isComplex: false }
  }

  // Watch repairs
  if (deviceType === 'watch') {
    return { display: 'Around 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
  }

  // Unknown device
  return { display: 'Usually 1–5 working days depending on the repair', minHours: 24, maxHours: 120, isComplex: false }
}

/**
 * Workload level — used to adjust ETAs based on current queue.
 */
export type WorkloadLevel = 'quiet' | 'normal' | 'busy' | 'very_busy'

/**
 * Priority tier for a job — quick phone repairs get priority over
 * laptops, consoles, and board-level jobs.
 */
export type PriorityTier = 'quick' | 'standard' | 'heavy' | 'board_level'

export interface WorkloadInfo {
  level: WorkloadLevel
  activeJobs: number
  activeJobsSameType: number
  adjustment: number // multiplier for ETA (1.0 = no change, 1.5 = 50% longer)
  benchHoursAhead: number // raw total bench hours queued ahead of this job
  weightedBenchHoursAhead: number // impact-matrix-weighted hours that actually delay this job
  priorityTier: PriorityTier
  jobsByTier: { quick: number; standard: number; heavy: number; board_level: number }
}

/**
 * Classify a job's priority tier based on device type and issue.
 *
 * - quick: phone/watch quick repairs (screen, battery, camera, charging port) — 1-6 hours bench time
 * - standard: phone/tablet/watch non-complex repairs, console HDMI/drive — up to 1-2 days
 * - heavy: laptop repairs, console complex, tablet complex — 1-3 days
 * - board_level: motherboard, liquid damage, data recovery, no-power — up to 7-10 days
 */
export function getPriorityTier(
  deviceType: 'phone' | 'tablet' | 'laptop' | 'console' | 'watch' | 'other',
  issue: string
): PriorityTier {
  if (isComplexIssue(issue)) return 'board_level'

  const i = (issue || '').toLowerCase()

  // Quick phone repairs — prioritised
  if (deviceType === 'phone' || deviceType === 'watch') {
    if (
      i.includes('battery') ||
      i.includes('screen') ||
      i.includes('display') ||
      i.includes('lcd') ||
      i.includes('oled') ||
      i.includes('camera') ||
      i.includes('charging port') ||
      i.includes('microphone') ||
      i.includes('speaker') ||
      i.includes('audio') ||
      i.includes('software') ||
      i.includes('reset') ||
      i.includes('restore') ||
      i.includes('setup') ||
      i.includes('glue') ||
      i.includes('back on')
    ) {
      return 'quick'
    }
    return 'standard'
  }

  // Tablets — standard unless complex
  if (deviceType === 'tablet') {
    if (
      i.includes('battery') ||
      i.includes('screen') ||
      i.includes('display') ||
      i.includes('charging') ||
      i.includes('reset') ||
      i.includes('restore') ||
      i.includes('software')
    ) {
      return 'standard'
    }
    return 'heavy'
  }

  // Laptops — heavy by default
  if (deviceType === 'laptop') {
    if (i.includes('sound') || i.includes('speaker') || i.includes('audio') || i.includes('no display')) {
      return 'standard'
    }
    return 'heavy'
  }

  // Consoles — standard for HDMI/drive, heavy for complex
  if (deviceType === 'console') {
    if (i.includes('hdmi') || i.includes('disc') || i.includes('drive') || i.includes('controller') || i.includes('stick') || i.includes('drift') || i.includes('button')) {
      return 'standard'
    }
    return 'heavy'
  }

  return 'heavy'
}

/**
 * Get the expected bench hours for a job based on its priority tier.
 * These are realistic mid-range bench-time estimates (not customer-facing
 * turnaround), used for workload/queue calculations.
 */
function benchHoursForTier(tier: PriorityTier): number {
  switch (tier) {
    case 'quick': return 1        // phone screen/battery/camera: ~30-90 min
    case 'standard': return 3     // tablet screen, console HDMI, controller: ~2-4h
    case 'heavy': return 8        // laptop screen/software, tablet complex: ~4-24h
    case 'board_level': return 24 // motherboard/liquid/data recovery: 1-10 days
  }
}

/**
 * Queue impact matrix: how much does a queued job of tier X delay
 * a target job of tier Y?
 *
 * Key rules:
 * - Quick jobs ahead of quick jobs = STRONG impact (they compete for the same bench slot)
 * - Heavy/board jobs ahead of quick jobs = MINIMAL impact (quick job jumps ahead)
 * - Quick jobs ahead of heavy jobs = MODERATE impact (quick jobs jump ahead, heavy job waits)
 * - Heavy jobs ahead of heavy jobs = MODERATE impact
 * - Board-level jobs ahead of anything = LOW impact (they occupy bench for long
 *   but don't block other jobs the same way — we work around them)
 */
function queueImpactWeight(
  queuedTier: PriorityTier,
  targetTier: PriorityTier
): number {
  // Impact matrix: [queued][target]
  // Rows = queued job tier, Columns = target job tier
  // Values = what fraction of the queued job's bench time actually delays the target
  const matrix: Record<PriorityTier, Record<PriorityTier, number>> = {
    // queued: quick
    quick: {
      quick: 1.0,        // Another quick job ahead = full impact (same slot)
      standard: 0.7,     // Quick job ahead of standard = mostly impacts
      heavy: 0.5,        // Quick job ahead of heavy = moderate (quick finishes fast)
      board_level: 0.3,  // Quick job ahead of board = low (board is long anyway)
    },
    // queued: standard
    standard: {
      quick: 0.3,        // Standard job ahead of quick = low (quick jumps ahead)
      standard: 0.8,     // Standard ahead of standard = high
      heavy: 0.7,        // Standard ahead of heavy = moderate-high
      board_level: 0.4,  // Standard ahead of board = low-moderate
    },
    // queued: heavy
    heavy: {
      quick: 0.15,       // Heavy job ahead of quick = minimal (quick jumps ahead!)
      standard: 0.4,     // Heavy ahead of standard = moderate
      heavy: 0.7,        // Heavy ahead of heavy = high
      board_level: 0.5,  // Heavy ahead of board = moderate
    },
    // queued: board_level
    board_level: {
      quick: 0.1,        // Board job ahead of quick = almost no impact (quick jumps ahead!)
      standard: 0.25,    // Board ahead of standard = low
      heavy: 0.4,        // Board ahead of heavy = moderate
      board_level: 0.6,  // Board ahead of board = moderate-high (equipment contention)
    },
  }
  return matrix[queuedTier][targetTier]
}

/**
 * Calculate workload adjustment from actual job records.
 *
 * This is the proper workload engine: instead of just counting active jobs,
 * it estimates the bench hours queued ahead using a priority-weighted impact
 * matrix. Quick phone repairs are barely affected by heavy/board jobs ahead
 * (they jump the queue), but ARE affected by other quick jobs ahead.
 *
 * @param activeJobs - Array of active job records with device_make, device_model, issue, status
 * @param currentJob - The job we're calculating ETA for
 */
export function calculateWorkloadFromJobs(
  activeJobs: Array<{ device_make?: string; device_model?: string; issue?: string; status?: string }>,
  currentJob: { device_make?: string; device_model?: string; issue?: string }
): WorkloadInfo {
  const currentDeviceType = getDeviceType(currentJob.device_make || '', currentJob.device_model || '')
  const currentTier = getPriorityTier(currentDeviceType, currentJob.issue || '')

  // Calculate weighted bench hours ahead using the impact matrix
  let weightedBenchHoursAhead = 0
  let totalBenchHoursAhead = 0
  let sameTierCount = 0
  let jobsByTier: Record<PriorityTier, number> = { quick: 0, standard: 0, heavy: 0, board_level: 0 }

  for (const job of activeJobs) {
    const jobDeviceType = getDeviceType(job.device_make || '', job.device_model || '')
    const jobTier = getPriorityTier(jobDeviceType, job.issue || '')
    const jobBenchHours = benchHoursForTier(jobTier)

    jobsByTier[jobTier]++

    if (jobTier === currentTier) {
      sameTierCount++
    }

    // Jobs already being repaired count 30% (will finish soon)
    const statusFactor = job.status === 'IN_REPAIR' ? 0.3 : 1.0
    const effectiveBenchHours = jobBenchHours * statusFactor

    totalBenchHoursAhead += effectiveBenchHours
    // Apply the impact matrix: how much does this job actually delay our target?
    const impactWeight = queueImpactWeight(jobTier, currentTier)
    weightedBenchHoursAhead += effectiveBenchHours * impactWeight
  }

  // The weighted bench hours ahead is what actually delays this job.
  // Convert to "effective working days ahead" (8 bench hours = 1 working day)
  const effectiveWorkingDaysAhead = weightedBenchHoursAhead / 8

  // Determine workload level based on effective delay, not raw count
  let level: WorkloadLevel = 'quiet'
  let baseAdjustment = 1.0

  if (effectiveWorkingDaysAhead >= 3) {
    level = 'very_busy'
    baseAdjustment = 1.6
  } else if (effectiveWorkingDaysAhead >= 1.5) {
    level = 'busy'
    baseAdjustment = 1.3
  } else if (effectiveWorkingDaysAhead >= 0.5) {
    level = 'normal'
    baseAdjustment = 1.15
  } else {
    level = 'quiet'
    baseAdjustment = 1.0
  }

  // Same-tier jobs add extra delay (equipment/tooling contention)
  if (sameTierCount >= 3) {
    baseAdjustment *= 1.15
  }

  // Cap adjustment to reasonable bounds
  const adjustment = Math.min(Math.max(baseAdjustment, 1.0), 2.5)

  return {
    level,
    activeJobs: activeJobs.length,
    activeJobsSameType: sameTierCount,
    adjustment,
    benchHoursAhead: totalBenchHoursAhead, // raw total for reporting
    weightedBenchHoursAhead, // impact-matrix-weighted
    priorityTier: currentTier,
    jobsByTier,
  }
}

/**
 * Legacy count-based workload calculation.
 * Kept for backward compatibility but calculateWorkloadFromJobs is preferred.
 */
export function calculateWorkload(
  activeJobs: number,
  activeJobsSameType: number
): WorkloadInfo {
  // Determine level based on total active jobs
  let level: WorkloadLevel = 'quiet'
  if (activeJobs >= 10) level = 'very_busy'
  else if (activeJobs >= 6) level = 'busy'
  else if (activeJobs >= 3) level = 'normal'
  else level = 'quiet'

  // Adjustment multiplier
  let adjustment = 1.0
  if (level === 'busy') adjustment = 1.3
  else if (level === 'very_busy') adjustment = 1.6
  // Same-type jobs add more delay (board-level jobs block each other)
  if (activeJobsSameType >= 3) adjustment *= 1.2

  return { level, activeJobs, activeJobsSameType, adjustment, benchHoursAhead: 0, weightedBenchHoursAhead: 0, priorityTier: 'standard', jobsByTier: { quick: 0, standard: 0, heavy: 0, board_level: 0 } }
}

/**
 * Format a time range in hours as natural customer-facing text.
 * Handles sub-hour times (e.g. 0.5h → "30 minutes", 1.5h → "1.5 hours")
 * and converts to "later today" / "tomorrow" where appropriate.
 */
function formatTimeRange(minHours: number, maxHours: number): string {
  // Sub-hour: express in minutes
  if (maxHours <= 1) {
    const minMin = Math.round(minHours * 60)
    const maxMin = Math.round(maxHours * 60)
    if (minMin === maxMin) return `${maxMin} minutes`
    return `${minMin}–${maxMin} minutes`
  }

  // 1-8 hours: express in hours
  if (maxHours <= 8) {
    const minH = minHours < 1 ? Math.round(minHours * 60) / 60 : Math.ceil(minHours)
    const maxH = Math.ceil(maxHours)
    if (minH < 1) {
      // e.g. 0.5-2 hours → "30 mins to 2 hours"
      const minMin = Math.round(minHours * 60)
      return `${minMin} minutes to ${maxH} hours`
    }
    return `${minH}–${maxH} hours`
  }

  // 8-48 hours: express in hours or "1-2 days"
  if (maxHours <= 48) {
    const minDays = Math.round(minHours / 24 * 10) / 10
    const maxDays = Math.round(maxHours / 24 * 10) / 10
    if (minDays < 1 && maxDays <= 1) {
      return `${Math.ceil(minHours)}–${Math.ceil(maxHours)} hours`
    }
    return `${Math.ceil(minHours / 24)}–${Math.ceil(maxHours / 24)} working days`
  }

  // > 48 hours: express in working days
  const minDays = Math.ceil(minHours / 24)
  const maxDays = Math.ceil(maxHours / 24)
  return `${minDays}–${maxDays} working days`
}

/**
 * Get a customer-facing ETA string that accounts for workload.
 * Combines the base estimate with workload adjustment.
 */
export function getWorkloadAdjustedEta(
  baseEstimate: TurnaroundEstimate,
  workload: WorkloadInfo | null,
  partsLeadTimeDays: number = 0
): string {
  // If no workload info, quiet, or adjustment is 1.0 (quick repairs that jump the queue),
  // just return the base estimate + parts lead time
  if (!workload || workload.level === 'quiet' || workload.adjustment <= 1.0) {
    if (partsLeadTimeDays > 0) {
      return `Parts ${partsLeadTimeDays}–${partsLeadTimeDays + 1} working days, then ${baseEstimate.display.toLowerCase()}`
    }
    return baseEstimate.display
  }

  // Adjust the estimate based on workload
  const adjustedMin = baseEstimate.minHours * workload.adjustment
  const adjustedMax = baseEstimate.maxHours * workload.adjustment

  let repairEta: string
  if (baseEstimate.isComplex) {
    // Complex repairs — express in days, never fake precision
    const minDays = Math.ceil(adjustedMin / 24)
    const maxDays = Math.ceil(adjustedMax / 24)
    if (workload.level === 'very_busy') {
      repairEta = `Usually ${minDays}–${maxDays} working days, currently ${maxDays}–${maxDays + 2} days due to workload`
    } else if (workload.level === 'busy') {
      repairEta = `Usually ${minDays}–${maxDays} working days, currently around ${maxDays} days`
    } else {
      repairEta = baseEstimate.display
    }
  } else if (adjustedMax <= 8) {
    // Short repairs — express in hours or minutes
    const timeRange = formatTimeRange(adjustedMin, adjustedMax)
    if (workload.level === 'very_busy') {
      const bumpedMax = adjustedMax + 2
      const bumpedRange = formatTimeRange(adjustedMin, bumpedMax)
      repairEta = `Usually ${timeRange}, but currently closer to ${bumpedRange} due to workload`
    } else if (workload.level === 'busy') {
      const bumpedMax = adjustedMax + 1
      const bumpedRange = formatTimeRange(adjustedMin, bumpedMax)
      repairEta = `Usually ${timeRange}, currently around ${bumpedRange} based on today's workload`
    } else {
      repairEta = baseEstimate.display
    }
  } else {
    // Medium/long repairs — express in days
    const minDays = Math.ceil(adjustedMin / 24)
    const maxDays = Math.ceil(adjustedMax / 24)
    if (workload.level === 'very_busy') {
      repairEta = `Usually ${minDays}–${maxDays} working days, currently ${maxDays + 1}–${maxDays + 2} days due to workload`
    } else if (workload.level === 'busy') {
      repairEta = `Usually ${minDays}–${maxDays} working days, currently around ${maxDays}–${maxDays + 1} days`
    } else {
      repairEta = baseEstimate.display
    }
  }

  // Add parts lead time if applicable
  if (partsLeadTimeDays > 0) {
    return `Parts ${partsLeadTimeDays}–${partsLeadTimeDays + 1} working days, then ${repairEta.toLowerCase()}`
  }

  return repairEta
}

/**
 * Get a short ETA for SMS responses.
 * Returns a concise string suitable for text messages.
 */
export function getShortEta(
  baseEstimate: TurnaroundEstimate,
  workload: WorkloadInfo | null,
  partsLeadTimeDays: number = 0
): string {
  // If no workload, quiet, or adjustment is 1.0 (quick repairs that jump the queue),
  // just return the base estimate — no workload delay to communicate
  if (!workload || workload.level === 'quiet' || workload.adjustment <= 1.0) {
    if (partsLeadTimeDays > 0) {
      return `Parts ${partsLeadTimeDays}–${partsLeadTimeDays + 1} days, then ${baseEstimate.display.toLowerCase()}`
    }
    return baseEstimate.display
  }

  const adjustedMin = baseEstimate.minHours * workload.adjustment
  const adjustedMax = baseEstimate.maxHours * workload.adjustment

  let repairEta: string
  if (baseEstimate.isComplex) {
    const maxDays = Math.ceil(adjustedMax / 24)
    repairEta = workload.level === 'very_busy'
      ? `about ${maxDays}–${maxDays + 2} working days`
      : `about ${maxDays} working days`
  } else if (adjustedMax <= 8) {
    // Short repairs — use natural time formatting
    const timeRange = formatTimeRange(adjustedMin, adjustedMax)
    repairEta = workload.level === 'very_busy'
      ? `about ${formatTimeRange(adjustedMin, adjustedMax + 2)}`
      : `about ${timeRange}`
  } else {
    const maxDays = Math.ceil(adjustedMax / 24)
    repairEta = workload.level === 'very_busy'
      ? `about ${maxDays + 1}–${maxDays + 2} working days`
      : `about ${maxDays}–${maxDays + 1} working days`
  }

  if (partsLeadTimeDays > 0) {
    return `Parts ${partsLeadTimeDays}–${partsLeadTimeDays + 1} days, then ${repairEta}`
  }

  return repairEta
}

/**
 * Calculate progress bar percentage based on time elapsed in current step.
 * Caps at 95% until status actually changes.
 */
export function calculateProgressPercent(
  hoursInStatus: number,
  estimate: TurnaroundEstimate
): number {
  if (estimate.isComplex) {
    // For complex repairs, progress more slowly
    const progress = (hoursInStatus / estimate.maxHours) * 100
    return Math.min(Math.max(progress, 5), 95)
  }
  // Normal: reach 50% at minHours, 90% at maxHours, cap at 95%
  if (hoursInStatus <= estimate.minHours) {
    return Math.max((hoursInStatus / estimate.minHours) * 50, 5)
  }
  if (hoursInStatus <= estimate.maxHours) {
    const overshoot = (hoursInStatus - estimate.minHours) / (estimate.maxHours - estimate.minHours)
    return Math.min(50 + overshoot * 40, 95)
  }
  // Exceeded expected time — cap at 95%
  return 95
}

/**
 * Visit frequency analysis for messaging.
 * Combines total count with time window to determine "anxiety level".
 */
export interface VisitFrequency {
  totalVisits: number
  visitsLastHour: number
  visitsLast24h: number
  tier: 'first' | 'normal' | 'frequent' | 'anxious' | 'very_anxious'
}

export function calculateVisitFrequency(
  views: { viewed_at: string }[],
  now: Date = new Date()
): VisitFrequency {
  const totalVisits = views.length
  const oneHourAgo = now.getTime() - 60 * 60 * 1000
  const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000

  const visitsLastHour = views.filter(
    (v) => new Date(v.viewed_at).getTime() > oneHourAgo
  ).length
  const visitsLast24h = views.filter(
    (v) => new Date(v.viewed_at).getTime() > twentyFourHoursAgo
  ).length

  let tier: VisitFrequency['tier'] = 'first'
  if (totalVisits <= 1) {
    tier = 'first'
  } else if (visitsLastHour >= 6) {
    tier = 'very_anxious'
  } else if (visitsLastHour >= 3) {
    tier = 'anxious'
  } else if (visitsLast24h >= 4) {
    tier = 'frequent'
  } else {
    tier = 'normal'
  }

  return { totalVisits, visitsLastHour, visitsLast24h, tier }
}

/**
 * Get the short one-liner reassurance message based on status, visit frequency,
 * and whether the repair is exceeding expected time.
 *
 * Note: We only text the customer when their device is ready to collect.
 * We update this page at every stage.
 */
export function getReassuranceMessage(
  status: string,
  tier: VisitFrequency['tier'],
  hoursInStatus: number,
  estimate: TurnaroundEstimate,
  repairAgreed: boolean
): string {
  const exceedingTime = hoursInStatus > estimate.maxHours

  // READY_TO_COLLECT — always positive
  if (status === 'READY_TO_COLLECT') {
    return "Your device is ready to collect! Pop in during our opening hours — we're holding it safely for you."
  }

  // COLLECTED / COMPLETED
  if (status === 'COLLECTED' || status === 'COMPLETED') {
    return "Thanks for choosing us! Hope everything's working perfectly."
  }

  // CANCELLED
  if (status === 'CANCELLED') {
    return "This repair has been cancelled. If you have any questions, just send us a text."
  }

  // DIAGNOSTIC
  if (status === 'DIAGNOSTIC') {
    if (repairAgreed) {
      if (tier === 'first') {
        return "Thanks for confirming! We're finalising everything and getting things ready. We'll start your repair ASAP and update this page soon."
      }
      if (tier === 'very_anxious') {
        return "We're getting everything ready to start your repair — ordering parts, finalising details. We'll update this page the moment work begins, so no need to keep checking."
      }
      return "We're finalising everything and will start your repair ASAP. We'll update this page the moment work begins."
    }
    if (tier === 'first') {
      return "We're checking your device to see what's needed. We'll update this page with our findings and a quote — no obligation until you're happy."
    }
    if (tier === 'very_anxious') {
      return "We're still checking your device thoroughly — we want to get it right. We'll update this page with our findings as soon as we know more, so no need to keep checking."
    }
    if (tier === 'frequent' || tier === 'anxious') {
      return "Diagnostics are still in progress — we're checking everything thoroughly. We'll update this page with a quote as soon as we know more."
    }
    return "We're running diagnostics on your device. We'll update this page with our findings and a quote."
  }

  // RECEIVED
  if (status === 'RECEIVED') {
    if (tier === 'first') {
      return `We've got your device and we're on the case. ${estimate.display}. We'll update this page as soon as there's any progress.`
    }
    if (tier === 'very_anxious') {
      return "Your device is in the queue and everything's on track. We'll update this page the moment there's any progress, so no need to keep checking."
    }
    if (tier === 'frequent' || tier === 'anxious') {
      return "Your device is in the queue and being assessed — everything's on track. We update this page at every stage."
    }
    return "Your device is in the queue and we're getting started. We'll update this page as soon as there's progress."
  }

  // IN_REPAIR
  if (status === 'IN_REPAIR') {
    if (exceedingTime) {
      if (tier === 'first') {
        return "Your repair is taking a little longer than expected — some issues need extra care to get right. We're still working on it and will update this page as soon as it's ready."
      }
      return "Still working on your repair — taking a little extra care to get it right. We'll update this page the moment it's done."
    }
    if (tier === 'first') {
      return `Your repair is underway. ${estimate.display}. We'll update this page as soon as it's ready.`
    }
    if (tier === 'very_anxious') {
      return "Your repair is in good hands and progressing well. We'll update this page the moment it's ready, so no need to keep checking."
    }
    if (tier === 'anxious') {
      return "All on track — we'll update this page as soon as it's done, so no need to keep checking."
    }
    if (tier === 'frequent') {
      return "Your repair is progressing well and is on track. This page is always updated first — we'll update it the moment it's ready."
    }
    return "Your repair is progressing well. We'll update this page the moment it's ready."
  }

  // PARTS_ORDERED
  if (status === 'PARTS_ORDERED') {
    if (tier === 'first') {
      return "We've ordered the parts for your repair. Parts typically arrive within 2–3 working days. We'll update this page when they arrive."
    }
    if (tier === 'very_anxious' || tier === 'anxious') {
      return "Parts are on their way — we check deliveries every day. We'll update this page the moment they arrive, so no need to keep checking."
    }
    if (tier === 'frequent') {
      return "Parts are still on their way — we check deliveries daily and will update this page when they arrive."
    }
    return "Parts are on their way — we'll update this page when they arrive and start your repair straight away."
  }

  // PARTS_ARRIVED — message depends on whether device is in shop
  if (status === 'PARTS_ARRIVED') {
    // Note: device_in_shop is checked by the caller via job data,
    // but tracking-utils doesn't have access to it. The caller
    // (tracking page) handles this by passing the right context.
    // Default message assumes device still with customer.
    if (tier === 'first') {
      return `Good news — your parts have arrived! Bring your device in whenever suits you and we'll get started. ${estimate.display} once we start.`
    }
    return "Parts have arrived! Bring your device in during opening hours and we'll get started straight away."
  }

  // AWAITING_DEPOSIT
  if (status === 'AWAITING_DEPOSIT') {
    if (tier === 'first') {
      return "We need a £20 deposit to order parts for your repair. You can pay it here: https://pay.sumup.com/b2c/Q9OZOAJT — once it's paid we'll get parts ordered straight away."
    }
    return "Still waiting for the £20 deposit to order parts. Pay here: https://pay.sumup.com/b2c/Q9OZOAJT — we can start as soon as we receive it."
  }

  // AWAITING_DEVICE — parts in stock, waiting for customer to bring device
  if (status === 'AWAITING_DEVICE') {
    return "We've got the parts in stock for your repair. Just bring your device in whenever you're ready during opening hours — no appointment needed."
  }

  // QUOTE_APPROVED — legacy status (now AWAITING_DEVICE)
  if (status === 'QUOTE_APPROVED') {
    return "We're ready for your device — bring it in whenever you're ready during opening hours. No appointment needed."
  }

  // Default
  if (tier === 'very_anxious') {
    return "Everything's on track with your repair. We'll update this page the moment there's any progress, so no need to keep checking."
  }
  return "We're working on your repair and will update this page as soon as there's progress."
}

/**
 * Get a human-readable device description for messaging.
 */
export function getDeviceDescription(deviceMake: string, deviceModel: string): string {
  const make = (deviceMake || '').trim()
  const model = (deviceModel || '').trim()

  if (!make && !model) return 'your device'
  if (!make || make === 'N/A' || make === 'To be added') return model || 'your device'
  if (!model || model === 'N/A' || model === 'To be added') return make
  return `${make} ${model}`
}

/**
 * Generate activity log entries from page views and status changes.
 * Returns entries that look like the shop is actively monitoring the repair.
 */
export interface ActivityEntry {
  timestamp: string
  label: string
  isStatusChange: boolean
}

export function generateActivityLog(
  statusChangedAt: string | null,
  pageViews: { viewed_at: string }[],
  jobEvents: { created_at: string; message: string }[]
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  // Add real status change events
  for (const event of jobEvents.slice(0, 5)) {
    entries.push({
      timestamp: event.created_at,
      label: event.message.replace('Status changed to ', 'Status updated: '),
      isStatusChange: true,
    })
  }

  // Generate "checked on your repair" entries from page views
  // Use unique views spaced at least 1 hour apart to avoid spam
  const seenHours = new Set<string>()
  for (const view of pageViews.slice(0, 20)) {
    const d = new Date(view.viewed_at)
    const hourKey = d.toISOString().slice(0, 13) // YYYY-MM-DDTHH
    if (!seenHours.has(hourKey)) {
      seenHours.add(hourKey)
      entries.push({
        timestamp: view.viewed_at,
        label: 'Checked on your repair, all on track',
        isStatusChange: false,
      })
    }
  }

  // Sort by time descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Return top 5
  return entries.slice(0, 5)
}
