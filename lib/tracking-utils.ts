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
 * All times are deliberately generous (under-promise, over-deliver).
 */
export function getTurnaroundEstimate(
  deviceMake: string,
  deviceModel: string,
  issue: string,
  status: string
): TurnaroundEstimate {
  const deviceType = getDeviceType(deviceMake, deviceModel)
  const issueLower = (issue || '').toLowerCase()
  const complex = isComplexIssue(issue)

  // Complex repairs — long turnaround regardless of device
  if (complex) {
    if (issueLower.includes('data recovery')) {
      return { display: 'Usually up to 7 days — we want to make sure we recover everything safely, and quite often we get it back to you quicker', minHours: 72, maxHours: 168, isComplex: true }
    }
    if (deviceType === 'phone' || deviceType === 'watch') {
      return { display: 'Usually up to 7 days, but quite often we get it back to you quicker than that', minHours: 72, maxHours: 168, isComplex: true }
    }
    if (deviceType === 'tablet') {
      return { display: 'Usually up to 7 days, but quite often we get it back to you quicker than that', minHours: 72, maxHours: 168, isComplex: true }
    }
    if (deviceType === 'laptop') {
      return { display: 'Usually up to 10 days, but quite often we get it back to you quicker than that', minHours: 96, maxHours: 240, isComplex: true }
    }
    return { display: 'Usually up to 7 days, but quite often we get it back to you quicker than that', minHours: 72, maxHours: 168, isComplex: true }
  }

  // Phone repairs
  if (deviceType === 'phone') {
    if (issueLower.includes('battery')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display') || issueLower.includes('lcd') || issueLower.includes('oled')) {
      return { display: 'Usually 2–6 hours, sometimes next day', minHours: 2, maxHours: 24, isComplex: false }
    }
    if (issueLower.includes('charging port') || issueLower.includes('charging')) {
      return { display: 'Usually 2–4 hours, sometimes 1–2 days', minHours: 2, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('camera')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('back glass') || issueLower.includes('back cover')) {
      return { display: 'Usually 1–3 days', minHours: 24, maxHours: 72, isComplex: false }
    }
    if (issueLower.includes('virus') || issueLower.includes('software') || issueLower.includes('reset') || issueLower.includes('restore') || issueLower.includes('setup')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('glue') || issueLower.includes('back on')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('microphone') || issueLower.includes('speaker') || issueLower.includes('audio')) {
      return { display: 'Usually 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
    }
    // Phone — other/unknown
    return { display: 'Usually 2–6 hours, sometimes 1–2 days', minHours: 2, maxHours: 48, isComplex: false }
  }

  // Tablet repairs
  if (deviceType === 'tablet') {
    if (issueLower.includes('battery')) {
      return { display: 'Usually 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display')) {
      return { display: 'Usually 2–8 hours, sometimes 1–2 days', minHours: 2, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('charging')) {
      return { display: 'Usually 2–4 hours, sometimes 1–2 days', minHours: 2, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('reset') || issueLower.includes('restore') || issueLower.includes('software')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    // Tablet — other/unknown
    return { display: 'Usually 1–3 days, complex issues up to 7 days', minHours: 24, maxHours: 168, isComplex: false }
  }

  // Laptop repairs
  if (deviceType === 'laptop') {
    if (issueLower.includes('battery')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('screen') || issueLower.includes('display')) {
      return { display: 'Usually 1–3 days', minHours: 24, maxHours: 72, isComplex: false }
    }
    if (issueLower.includes('keyboard')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('software') || issueLower.includes('windows') || issueLower.includes('os') || issueLower.includes('virus') || issueLower.includes('reinstall') || issueLower.includes('outlook') || issueLower.includes('word') || issueLower.includes('email')) {
      return { display: 'Usually 1–3 days', minHours: 24, maxHours: 72, isComplex: false }
    }
    if (issueLower.includes('sound') || issueLower.includes('speaker') || issueLower.includes('audio')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    if (issueLower.includes('no display') || issueLower.includes('not displaying')) {
      return { display: 'Usually 1–3 hours', minHours: 1, maxHours: 3, isComplex: false }
    }
    // Laptop — other/unknown
    return { display: 'Usually 1–3 days, complex issues up to 10 days', minHours: 24, maxHours: 240, isComplex: false }
  }

  // Console repairs
  if (deviceType === 'console') {
    if (issueLower.includes('hdmi')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('overheat')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('disc') || issueLower.includes('drive')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    if (issueLower.includes('controller') || issueLower.includes('stick') || issueLower.includes('drift') || issueLower.includes('button')) {
      return { display: 'Usually 1–2 days', minHours: 24, maxHours: 48, isComplex: false }
    }
    // Console — other/unknown
    return { display: 'Usually 1–3 days', minHours: 24, maxHours: 72, isComplex: false }
  }

  // Watch repairs
  if (deviceType === 'watch') {
    return { display: 'Usually 2–4 hours', minHours: 2, maxHours: 4, isComplex: false }
  }

  // Unknown device
  return { display: 'Usually 1–5 days depending on the repair', minHours: 24, maxHours: 120, isComplex: false }
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

  // PARTS_ARRIVED
  if (status === 'PARTS_ARRIVED') {
    if (tier === 'first') {
      return `Good news — your parts have arrived and we're getting started. ${estimate.display} from this point.`
    }
    return "Parts have arrived and we're starting your repair. We'll update this page as soon as it's ready."
  }

  // AWAITING_DEPOSIT
  if (status === 'AWAITING_DEPOSIT') {
    if (tier === 'first') {
      return "We need a small deposit to order parts for your repair. Check your messages for payment details."
    }
    return "Still waiting for deposit payment to order parts. We can start as soon as we receive it — check your messages for details."
  }

  // QUOTE_APPROVED
  if (status === 'QUOTE_APPROVED') {
    return "Your quote has been approved. Drop off your device whenever you're ready — we'll complete the details when you arrive."
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
