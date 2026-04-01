'use client'

import Link from 'next/link'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { JobWithMetrics } from '@/lib/job-utils'
import { 
  formatTimeInStatus, 
  getBlockerText, 
  getCustomerFlagEmoji, 
  getPriorityEmoji 
} from '@/lib/job-utils'

interface EnhancedJobTileProps {
  job: JobWithMetrics
}

export default function EnhancedJobTile({ job }: EnhancedJobTileProps) {
  const priorityEmoji = getPriorityEmoji(job.priority_score)
  const flagEmoji = getCustomerFlagEmoji(job.customer_flag)
  const blockerText = getBlockerText(job.blockerType, job)
  const timeText = formatTimeInStatus(job.status_changed_at)
  
  // Determine if time should show warning (>3 days)
  const timeWarning = job.isOverdue

  // Get shortened status label for compact display
  const getShortStatus = (status: string) => {
    const shortLabels: Record<string, string> = {
      'QUOTE_APPROVED': 'Approved',
      'AWAITING_DEPOSIT': 'Deposit',
      'PARTS_ORDERED': 'Parts',
      'PARTS_ARRIVED': 'Arrived',
      'IN_REPAIR': 'Repair',
      'READY_TO_COLLECT': 'Collect',
      'COLLECTED': 'Collected',
      'COMPLETED': 'Done',
      'CANCELLED': 'Cancel',
      'RECEIVED': 'Received',
      'DELAYED': 'Delayed'
    }
    return shortLabels[status] || JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS]
  }

  return (
    <Link
      href={`/app/jobs/${job.id}`}
      className={`relative block rounded-xl shadow-lg overflow-hidden active:scale-95 transition-all aspect-square ${JOB_STATUS_COLORS[job.status]}`}
    >
      <div className="p-3 h-full flex flex-col relative text-white">
        {/* Top Row: Status + Priority Icon */}
        <div className="text-center mb-2 flex items-center justify-center gap-1">
          {priorityEmoji && (
            <span className="text-base" title="High Priority">{priorityEmoji}</span>
          )}
          <p className="font-black text-xs leading-tight uppercase tracking-wide">
            {getShortStatus(job.status)}
          </p>
        </div>

        {/* Main Content: Device & Issue */}
        <div className="flex-1 flex flex-col justify-center text-center">
          <p className="text-sm font-black leading-tight mb-1 truncate">
            {job.device_make} {job.device_model}
          </p>
          <p className="text-xs font-semibold truncate">{job.issue}</p>
        </div>

        {/* Bottom Row: Time + Flags */}
        <div className="flex items-center justify-between text-xs mt-2">
          <span className={`font-bold ${timeWarning ? 'text-yellow-300' : 'text-white/80'}`}>
            {timeWarning && '⚠️ '}{timeText}
          </span>
          {flagEmoji && (
            <span className="text-base" title={job.customer_flag || undefined}>
              {flagEmoji}
            </span>
          )}
        </div>

        {/* Blocker Badge (if applicable) */}
        {blockerText && (
          <div className="mt-2 bg-white/20 backdrop-blur-sm rounded-md px-2 py-1 text-center">
            <p className="text-xs font-bold truncate">{blockerText}</p>
          </div>
        )}

        {/* Deposit Indicator (legacy - keeping for compatibility) */}
        {job.deposit_required && !job.deposit_received && (
          <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full shadow-md flex items-center justify-center">
            <span className="text-xs font-black text-yellow-600">£</span>
          </div>
        )}
      </div>
    </Link>
  )
}
