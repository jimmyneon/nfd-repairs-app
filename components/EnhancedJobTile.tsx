'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_BORDER_COLORS } from '@/lib/constants'
import { JobWithMetrics } from '@/lib/job-utils'
import {
  formatTimeInStatus,
  getBlockerText,
  getCustomerFlagEmoji,
  getPriorityEmoji
} from '@/lib/job-utils'
import { MapPin, Clock, MoreVertical, User } from 'lucide-react'
import { useState } from 'react'
import QuickActionsModal from '@/components/QuickActionsModal'
import { JobStatus } from '@/lib/types-v3'

function formatStatusTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

interface EnhancedJobTileProps {
  job: JobWithMetrics
}

export default function EnhancedJobTile({ job }: EnhancedJobTileProps) {
  const router = useRouter()
  const supabase = createClient()
  const [showQuickActions, setShowQuickActions] = useState(false)

  const priorityEmoji = getPriorityEmoji(job.priority_score)
  const flagEmoji = getCustomerFlagEmoji(job.customer_flag)
  const blockerText = getBlockerText(job.blockerType, job)
  const timeText = formatTimeInStatus(job.status_changed_at, job.created_at)

  const customerArrived = job.customer_arrived_at &&
    (new Date().getTime() - new Date(job.customer_arrived_at).getTime()) < 30 * 60 * 1000

  const timeWarning = job.isOverdue

  const getShortStatus = (status: string) => {
    const shortLabels: Record<string, string> = {
      'QUOTE_APPROVED': 'Approved',
      'AWAITING_DEPOSIT': 'Deposit',
      'PARTS_ORDERED': 'Parts',
      'PARTS_ARRIVED': 'Arrived',
      'IN_REPAIR': 'Repair',
      'READY_TO_COLLECT': 'Collect',
      'IN_STORAGE': 'Storage',
      'COLLECTED': 'Collected',
      'COMPLETED': 'Done',
      'CANCELLED': 'Cancel',
      'RECEIVED': 'Received',
      'DELAYED': 'Delayed'
    }
    return shortLabels[status] || JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS]
  }

  const handleCardClick = () => {
    router.push(`/app/jobs/${job.id}`)
  }

  const handleQuickActionsClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowQuickActions(true)
  }

  const handleQuickStatusChange = async (status: JobStatus) => {
    setShowQuickActions(false)

    const updateData: any = { status, status_changed_at: new Date().toISOString() }
    if (status === 'RECEIVED') {
      updateData.device_in_shop = true
    } else if (status === 'COLLECTED') {
      updateData.device_in_shop = false
      updateData.customer_arrived_at = null
    }

    await supabase.from('jobs').update(updateData).eq('id', job.id)
    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Status changed to ${JOB_STATUS_LABELS[status]}`,
    })
    try {
      await fetch('/api/jobs/queue-status-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, status }),
      })
    } catch (error) {
      console.error('Failed to queue status SMS:', error)
    }
  }

  const handleQuickDelete = async () => {
    setShowQuickActions(false)
    await supabase.from('job_events').delete().eq('job_id', job.id)
    await supabase.from('sms_logs').delete().eq('job_id', job.id)
    await supabase.from('email_logs').delete().eq('job_id', job.id)
    await supabase.from('notifications').delete().eq('job_id', job.id)
    await supabase.from('jobs').delete().eq('id', job.id)
    router.refresh()
  }

  // Status accent color for left border
  const borderAccent = JOB_STATUS_BORDER_COLORS[job.status] || 'border-gray-400'
  const statusBg = JOB_STATUS_COLORS[job.status] || 'bg-gray-600 text-white'

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer select-none border-l-4 ${borderAccent} ${
          customerArrived ? 'ring-4 ring-yellow-400 ring-offset-2 animate-pulse' : ''
        }`}
      >
        {/* Customer Arrived Banner */}
        {customerArrived && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-gray-900 px-2 py-1 text-center z-10 rounded-t-xl">
            <div className="flex items-center justify-center gap-1 text-xs font-black">
              <MapPin className="h-3 w-3" />
              <span>CUSTOMER HERE</span>
            </div>
          </div>
        )}

        <div className={`p-3 ${customerArrived ? 'pt-8' : ''}`}>
          {/* Top Row: Status badge + Quick actions button */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className={`${statusBg} px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide`}>
                {getShortStatus(job.status)}
              </span>
              {priorityEmoji && (
                <span className="text-sm" title="High Priority">{priorityEmoji}</span>
              )}
              {flagEmoji && (
                <span className="text-sm" title={job.customer_flag || undefined}>{flagEmoji}</span>
              )}
            </div>
            <button
              onClick={handleQuickActionsClick}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Quick Actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>

          {/* Main Content: Device & Issue */}
          <div className="mb-2">
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate">
              {job.device_make} {job.device_model}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{job.issue}</p>
          </div>

          {/* Customer name */}
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <User className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{job.customer_name}</span>
          </div>

          {/* Blocker Badge (if applicable) */}
          {blockerText && (
            <div className="mb-2 bg-gray-100 dark:bg-gray-700 rounded-md px-2 py-1">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{blockerText}</p>
            </div>
          )}

          {/* Bottom Row: Time + Deposit indicator */}
          <div className="flex items-center justify-between text-xs border-t border-gray-100 dark:border-gray-700 pt-2">
            <div className="flex flex-col">
              <span className={`font-bold ${timeWarning ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {timeWarning && '⚠️ '}{timeText}
              </span>
              {job.status_changed_at && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatStatusTimestamp(job.status_changed_at)}
                </span>
              )}
            </div>
            {job.deposit_required && !job.deposit_received && (
              <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-full px-2 py-0.5">
                <span className="text-xs font-black text-yellow-700 dark:text-yellow-400">£ Deposit</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showQuickActions && (
        <QuickActionsModal
          jobRef={job.job_ref}
          deviceInfo={`${job.device_make} ${job.device_model}`}
          currentStatus={job.status}
          onSelectStatus={handleQuickStatusChange}
          onDelete={handleQuickDelete}
          onClose={() => setShowQuickActions(false)}
        />
      )}
    </>
  )
}
