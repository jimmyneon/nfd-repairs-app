'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Star, CheckCircle2, Circle, Send, Loader2 } from 'lucide-react'

interface ReviewPlatformControlsProps {
  job: Job
  onUpdate: () => void
}

const PLATFORMS = [
  { key: 'google', label: 'Google', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300', icon: '🔍' },
  { key: 'facebook', label: 'Facebook', color: 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300', icon: '📘' },
  { key: 'trustpilot', label: 'Trustpilot', color: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300', icon: '⭐' },
]

export default function ReviewPlatformControls({ job, onUpdate }: ReviewPlatformControlsProps) {
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
      setSendResult('All review platforms completed! 🎉')
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
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100 dark:border-gray-700">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Review Platforms</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Mark which platforms the customer has reviewed on. Next request will use the next un-ticked platform.
      </p>

      <div className="space-y-2 mb-4">
        {PLATFORMS.map((p) => {
          const isDone = completed.includes(p.key)
          const isSaving = saving === p.key
          return (
            <button
              key={p.key}
              onClick={() => togglePlatform(p.key)}
              disabled={isSaving}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all active:scale-[0.98] ${p.color} ${
                isDone ? 'opacity-100' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              <span className="font-bold text-sm flex-1 text-left">{p.label}</span>
              {isSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
          )
        })}
      </div>

      {nextPlatform ? (
        <button
          onClick={sendReviewRequest}
          disabled={sendingReview || job.skip_review_request}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
        >
          {sendingReview ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send {nextPlatform} Review Request
            </>
          )}
        </button>
      ) : (
        <div className="w-full text-center py-3 bg-green-50 dark:bg-green-900/30 rounded-xl border-2 border-green-200 dark:border-green-700">
          <Star className="h-5 w-5 text-green-600 inline mr-1" />
          <span className="text-sm font-bold text-green-700 dark:text-green-300">
            All platforms done — thank you!
          </span>
        </div>
      )}

      {job.skip_review_request && (
        <p className="text-xs text-red-500 mt-2 text-center">
          Review requests are disabled for this customer
        </p>
      )}

      {sendResult && (
        <p className="text-xs text-center mt-2 text-gray-600 dark:text-gray-400">{sendResult}</p>
      )}

      {job.last_review_platform_requested && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Last requested: {job.last_review_platform_requested}
        </p>
      )}
    </div>
  )
}
