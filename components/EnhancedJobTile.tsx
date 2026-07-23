'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { JOB_STATUS_LABELS, JOB_STATUS_SHORT_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { JobWithMetrics } from '@/lib/job-utils'
import {
  formatTimeInStatus,
  getBlockerText,
  getCustomerFlagEmoji,
  getPriorityEmoji
} from '@/lib/job-utils'
import { CheckCircle, Shield, MessageCircle } from 'lucide-react'
import { useState, useRef } from 'react'
import QuickActionsModal from '@/components/QuickActionsModal'
import { JobStatus } from '@/lib/types-v3'

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

  const handleCardClick = () => {
    router.push(`/app/jobs/${job.id}`)
  }

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setShowQuickActions(true)
    }, 500)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (longPressTriggered.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
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

    const { error: updateError } = await supabase.from('jobs').update(updateData).eq('id', job.id)
    if (updateError) {
      console.error('Status update failed:', updateError)
      alert(`Failed to update status: ${updateError.message}`)
      return
    }
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

  const statusBg = JOB_STATUS_COLORS[job.status] || 'bg-gray-600 text-white'

  return (
    <>
      <div
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className={`relative block rounded-xl shadow-lg overflow-hidden active:scale-95 transition-all cursor-pointer select-none aspect-square border-l-4 ${statusBg}`}
      >
        <div className="p-3 h-full flex flex-col relative text-white">

          {/* Top Row: Status label + badges */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              {customerArrived && (
                <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
              )}
              <p className="font-black text-xs leading-tight uppercase tracking-wide">
                {JOB_STATUS_SHORT_LABELS[job.status as JobStatus] || job.status}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {job.is_warranty && (
                <span className="bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title="Warranty repair">
                  <Shield className="h-3 w-3" />
                  W
                </span>
              )}
              {job.message_preference === 'whatsapp' && (
                <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title="Customer prefers WhatsApp">
                  <MessageCircle className="h-3 w-3" />
                  WA
                </span>
              )}
              {job.payment_received && (
                <span className="bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <CheckCircle className="h-3 w-3" />
                  PAID
                </span>
              )}
              {priorityEmoji && (
                <span className="text-sm" title="High Priority">{priorityEmoji}</span>
              )}
              {flagEmoji && (
                <span className="text-sm" title={job.customer_flag || undefined}>{flagEmoji}</span>
              )}
            </div>
          </div>

          {/* Device & Issue - Main Content */}
          <div className="flex-1 flex flex-col justify-center text-center">
            <p className="text-sm font-black leading-tight mb-1 truncate">{job.device_make} {job.device_model}</p>
            <p className="text-xs font-semibold truncate opacity-90">{job.issue}</p>
          </div>

          {/* Blocker Badge */}
          {blockerText && (
            <div className="mb-1 bg-white/20 rounded-md px-2 py-0.5">
              <p className="text-xs font-semibold truncate">{blockerText}</p>
            </div>
          )}

          {/* Bottom Row: Time + Deposit indicator */}
          <div className="flex items-center justify-between text-xs border-t border-white/20 pt-1.5">
            <span className={`font-bold ${timeWarning ? 'text-yellow-300' : 'opacity-80'}`}>
              {timeWarning && '⚠️ '}{timeText}
            </span>
            {!job.is_warranty && job.deposit_required && !job.deposit_received && (
              <div className="w-5 h-5 bg-white rounded-full shadow-md flex items-center justify-center">
                <span className="text-xs font-black text-yellow-600">£</span>
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
