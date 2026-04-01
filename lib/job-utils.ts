// Utility functions for action-oriented job management

import { Job, JobStatus } from './types-v3'

export type ActionGroup = 'URGENT' | 'READY_TO_WORK' | 'WAITING' | 'READY_TO_COLLECT' | 'COLLECTED' | 'OTHER'

export type BlockerType = 
  | 'DEPOSIT' 
  | 'PARTS_ORDERED' 
  | 'AWAITING_DROPOFF' 
  | 'DELAYED' 
  | 'NEEDS_DEPOSIT'
  | null

export interface JobWithMetrics extends Job {
  hoursInStatus: number
  daysInStatus: number
  actionGroup: ActionGroup
  blockerType: BlockerType
  isOverdue: boolean
  depositOverdueDays: number
}

/**
 * Calculate hours since status changed
 */
export function getHoursInStatus(statusChangedAt: string | null | undefined): number {
  if (!statusChangedAt) return 0
  const now = new Date()
  const changed = new Date(statusChangedAt)
  return (now.getTime() - changed.getTime()) / (1000 * 60 * 60)
}

/**
 * Calculate days since status changed
 */
export function getDaysInStatus(statusChangedAt: string | null | undefined): number {
  return getHoursInStatus(statusChangedAt) / 24
}

/**
 * Format time in status for display
 */
export function formatTimeInStatus(statusChangedAt: string | null | undefined): string {
  const hours = getHoursInStatus(statusChangedAt)
  
  if (hours < 1) return 'Just now'
  if (hours < 2) return '1h'
  if (hours < 24) return `${Math.floor(hours)}h`
  
  const days = Math.floor(hours / 24)
  if (days === 1) return '1d'
  if (days < 7) return `${days}d`
  
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

/**
 * Determine if job is overdue (>3 days in status)
 */
export function isJobOverdue(statusChangedAt: string | null | undefined): boolean {
  return getHoursInStatus(statusChangedAt) > 72 // 3 days
}

/**
 * Determine action group for a job
 */
export function getActionGroup(job: Job): ActionGroup {
  const hoursInStatus = getHoursInStatus(job.status_changed_at)
  
  // URGENT: Delayed >24hrs, high priority ready to work, or deposit overdue >48hrs
  if (job.status === 'DELAYED' && hoursInStatus > 24) return 'URGENT'
  
  if (
    ['IN_REPAIR', 'PARTS_ARRIVED', 'RECEIVED'].includes(job.status) &&
    (job.priority_score || 50) >= 80 &&
    job.device_in_shop
  ) {
    return 'URGENT'
  }
  
  if (job.status === 'AWAITING_DEPOSIT' && hoursInStatus > 48) return 'URGENT'
  
  // READY_TO_WORK: Can be worked on right now
  if (job.status === 'IN_REPAIR' && job.device_in_shop) return 'READY_TO_WORK'
  if (job.status === 'PARTS_ARRIVED' && job.device_in_shop) return 'READY_TO_WORK'
  if (job.status === 'RECEIVED' && !job.parts_required && job.device_in_shop) return 'READY_TO_WORK'
  
  // WAITING: Blocked by something
  if (job.status === 'AWAITING_DEPOSIT') return 'WAITING'
  if (job.status === 'PARTS_ORDERED') return 'WAITING'
  if (job.status === 'QUOTE_APPROVED') return 'WAITING'
  if (job.status === 'RECEIVED' && job.parts_required) return 'WAITING'
  
  // READY_TO_COLLECT: Waiting for customer
  if (job.status === 'READY_TO_COLLECT') return 'READY_TO_COLLECT'
  
  // COLLECTED: Waiting for auto-close
  if (job.status === 'COLLECTED') return 'COLLECTED'
  
  return 'OTHER'
}

/**
 * Determine blocker type for a job
 */
export function getBlockerType(job: Job): BlockerType {
  if (job.status === 'AWAITING_DEPOSIT') return 'DEPOSIT'
  if (job.status === 'PARTS_ORDERED') return 'PARTS_ORDERED'
  if (job.status === 'QUOTE_APPROVED') return 'AWAITING_DROPOFF'
  if (job.status === 'DELAYED') return 'DELAYED'
  if (job.status === 'RECEIVED' && job.parts_required) return 'NEEDS_DEPOSIT'
  return null
}

/**
 * Get blocker display text
 */
export function getBlockerText(blockerType: BlockerType, job: Job): string | null {
  if (!blockerType) return null
  
  switch (blockerType) {
    case 'DEPOSIT':
      const depositDays = Math.floor(getDaysInStatus(job.status_changed_at))
      return depositDays > 2 ? `£ Deposit (${depositDays}d overdue)` : '£ Deposit'
    case 'PARTS_ORDERED':
      if (job.parts_expected_at) {
        const expectedDate = new Date(job.parts_expected_at)
        const now = new Date()
        if (expectedDate > now) {
          const daysUntil = Math.ceil((expectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return `📦 Parts (${daysUntil}d)`
        } else {
          return '📦 Parts (overdue)'
        }
      }
      return '📦 Parts ordered'
    case 'AWAITING_DROPOFF':
      return '📍 Awaiting drop-off'
    case 'DELAYED':
      return `⏰ ${job.delay_reason || 'Delayed'}`
    case 'NEEDS_DEPOSIT':
      return '£ Needs deposit'
    default:
      return null
  }
}

/**
 * Calculate deposit overdue days
 */
export function getDepositOverdueDays(job: Job): number {
  if (job.status !== 'AWAITING_DEPOSIT') return 0
  const days = getDaysInStatus(job.status_changed_at)
  return Math.max(0, days - 2) // Overdue after 2 days
}

/**
 * Enrich job with calculated metrics
 */
export function enrichJobWithMetrics(job: Job): JobWithMetrics {
  return {
    ...job,
    hoursInStatus: getHoursInStatus(job.status_changed_at),
    daysInStatus: getDaysInStatus(job.status_changed_at),
    actionGroup: getActionGroup(job),
    blockerType: getBlockerType(job),
    isOverdue: isJobOverdue(job.status_changed_at),
    depositOverdueDays: getDepositOverdueDays(job),
  }
}

/**
 * Group jobs by action group
 */
export function groupJobsByAction(jobs: Job[]): Record<ActionGroup, JobWithMetrics[]> {
  const enrichedJobs = jobs.map(enrichJobWithMetrics)
  
  return {
    URGENT: enrichedJobs.filter(j => j.actionGroup === 'URGENT'),
    READY_TO_WORK: enrichedJobs.filter(j => j.actionGroup === 'READY_TO_WORK'),
    WAITING: enrichedJobs.filter(j => j.actionGroup === 'WAITING'),
    READY_TO_COLLECT: enrichedJobs.filter(j => j.actionGroup === 'READY_TO_COLLECT'),
    COLLECTED: enrichedJobs.filter(j => j.actionGroup === 'COLLECTED'),
    OTHER: enrichedJobs.filter(j => j.actionGroup === 'OTHER'),
  }
}

/**
 * Get customer flag emoji
 */
export function getCustomerFlagEmoji(flag: string | null | undefined): string | null {
  if (!flag) return null
  
  switch (flag) {
    case 'vip': return '🚩'
    case 'sensitive': return '⚠️'
    case 'awkward': return '😤'
    case 'normal': return null
    default: return null
  }
}

/**
 * Get priority emoji (fire for high priority)
 */
export function getPriorityEmoji(priorityScore: number | null | undefined): string | null {
  if (!priorityScore) return null
  return priorityScore >= 80 ? '🔥' : null
}

/**
 * Check if tracking link is expired
 */
export function isTrackingLinkExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const now = new Date()
  const expires = new Date(expiresAt)
  return now > expires
}
