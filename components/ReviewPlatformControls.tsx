'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Star, CheckCircle2, Circle, Send, Loader2, MousePointerClick } from 'lucide-react'
import SlideUpPanel from '@/components/SlideUpPanel'

interface ReviewPlatformControlsProps {
  job: Job
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

const PLATFORMS = [
  { key: 'google', label: 'Google', doneColor: 'bg-blue-600 text-white', clickedColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700', pendingColor: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  { key: 'facebook', label: 'Facebook', doneColor: 'bg-indigo-600 text-white', clickedColor: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700', pendingColor: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  { key: 'trustpilot', label: 'Trustpilot', doneColor: 'bg-green-600 text-white', clickedColor: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700', pendingColor: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
]

export default function ReviewPlatformControls({ job, isOpen, onClose, onUpdate }: ReviewPlatformControlsProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const [sendingReview, setSendingReview] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const supabase = createClient()

  const completed: string[] = job.review_platforms_completed || []

  const togglePlatform = async (platform: string) => {
    setSaving(platform)
    const current = [...completed]
    const idx = current.indexOf(platform)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(platform)
    }

    try {
      await supabase
        .from('jobs')
        .update({ review_platforms_completed: current } as any)
        .eq('id', job.id)

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Review marked: ${platform} ${idx >= 0 ? 'removed from' : 'added to'} completed reviews`,
      } as any)

      onUpdate()
    } catch (err) {
      console.error('Failed to toggle platform:', err)
    } finally {
      setSaving(null)
    }
  }

  const getNextPlatform = (): string | null => {
    for (const p of PLATFORMS) {
      if (!completed.includes(p.key)) return p.key
    }
    return null
  }

  const sendReviewRequest = async () => {
    const nextPlatform = getNextPlatform()
    if (!nextPlatform) {
      setSendResult('All review platforms completed!')
      return
    }

    setSendingReview(true)
    setSendResult(null)

    try {
      const response = await fetch('/api/jobs/send-collection-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, manual: true, platform: nextPlatform }),
      })
      const result = await response.json()

      if (result.success) {
        setSendResult(`Review request sent for ${nextPlatform}`)
        onUpdate()
      } else if (result.alreadySent) {
        setSendResult('Review request already sent for this job')
      } else if (result.skipped) {
        setSendResult(`Skipped: ${result.message}`)
      } else {
        setSendResult(`Failed: ${result.error || result.message || 'Unknown error'}`)
      }
    } catch (err) {
      setSendResult('Failed to send review request')
    } finally {
      setSendingReview(false)
      setTimeout(() => setSendResult(null), 5000)
    }
  }

  const nextPlatform = getNextPlatform()

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Review Platforms"
      icon={<Star className="h-5 w-5 text-primary" />}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Customer clicks are tracked automatically from the review page. Tap a button to manually confirm a review.
        </p>

        {/* Big square toggle buttons */}
        <div className="grid grid-cols-3 gap-3">
          {PLATFORMS.map((p) => {
            const isDone = completed.includes(p.key)
            const isSaving = saving === p.key
            return (
              <button
                key={p.key}
                onClick={() => togglePlatform(p.key)}
                disabled={isSaving}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border-2 ${
                  isDone
                    ? `${p.doneColor} border-transparent`
                    : `${p.clickedColor} border-2`
                }`}
              >
                {isSaving ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <MousePointerClick className="h-6 w-6" />
                )}
                <span className="text-xs font-bold text-center leading-tight">{p.label}</span>
                <span className="text-[10px] font-semibold opacity-80">
                  {isDone ? 'Confirmed' : 'Clicked'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> Customer clicked</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Confirmed by you</span>
        </div>

        {/* Send button or all done message */}
        {nextPlatform ? (
          <button
            onClick={sendReviewRequest}
            disabled={sendingReview || job.skip_review_request}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {sendingReview ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Send {nextPlatform} Review Request
              </>
            )}
          </button>
        ) : (
          <div className="w-full text-center py-4 bg-green-50 dark:bg-green-900/30 rounded-xl border-2 border-green-200 dark:border-green-700">
            <Star className="h-6 w-6 text-green-600 inline mb-1" />
            <p className="text-sm font-bold text-green-700 dark:text-green-300">
              All platforms done — thank you!
            </p>
          </div>
        )}

        {job.skip_review_request && (
          <p className="text-xs text-red-500 text-center">
            Review requests are disabled for this customer
          </p>
        )}

        {sendResult && (
          <p className="text-xs text-center text-gray-600 dark:text-gray-400">{sendResult}</p>
        )}

        {job.last_review_platform_requested && (
          <p className="text-xs text-gray-400 text-center">
            Last SMS sent for: {job.last_review_platform_requested}
          </p>
        )}

        {/* Review page link */}
        <a
          href={`https://newforestdevicerepairs.co.uk/review/?ref=${job.job_ref}`}
          target="_blank"
          rel="noopener"
          className="block text-center text-xs text-primary hover:underline"
        >
          View review page for this customer
        </a>
      </div>
    </SlideUpPanel>
  )
}
