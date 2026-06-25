'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { JobWithMetrics } from '@/lib/job-utils'
import { 
  formatTimeInStatus, 
  getBlockerText, 
  getCustomerFlagEmoji, 
  getPriorityEmoji 
} from '@/lib/job-utils'
import { MapPin, Clock } from 'lucide-react'
import { useRef, useState } from 'react'
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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  const priorityEmoji = getPriorityEmoji(job.priority_score)
  const flagEmoji = getCustomerFlagEmoji(job.customer_flag)
  const blockerText = getBlockerText(job.blockerType, job)
  const timeText = formatTimeInStatus(job.status_changed_at)
  
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
      'COLLECTED': 'Collected',
      'COMPLETED': 'Done',
      'CANCELLED': 'Cancel',
      'RECEIVED': 'Received',
      'DELAYED': 'Delayed'
    }
    return shortLabels[status] || JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS]
  }

  const handleLongPressStart = () => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setShowQuickActions(true)
    }, 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (longPressTriggered.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    router.push(`/app/jobs/${job.id}`)
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

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); setShowQuickActions(true) }}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleLongPressEnd}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        className={`relative block rounded-xl shadow-lg overflow-hidden active:scale-95 transition-all aspect-square cursor-pointer select-none ${
          customerArrived ? 'ring-4 ring-yellow-400 ring-offset-2 animate-pulse' : ''
        } ${JOB_STATUS_COLORS[job.status]}`}
      >
        <div className="p-3 h-full flex flex-col relative text-white">
          {/* Customer Arrived Banner */}
          {customerArrived && (
            <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-gray-900 px-2 py-1 text-center z-10">
              <div className="flex items-center justify-center gap-1 text-xs font-black">
                <MapPin className="h-3 w-3" />
                <span>CUSTOMER HERE</span>
              </div>
            </div>
          )}
          {/* Top Row: Status + Priority Icon */}
          <div className={`text-center mb-2 flex items-center justify-center gap-1 ${customerArrived ? 'mt-6' : ''}`}>
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
            <div className="flex flex-col">
              <span className={`font-bold ${timeWarning ? 'text-yellow-300' : 'text-white/80'}`}>
                {timeWarning && '⚠️ '}{timeText}
              </span>
              {job.status_changed_at && (
                <span className="text-[10px] text-white/60 flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatStatusTimestamp(job.status_changed_at)}
                </span>
              )}
            </div>
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
