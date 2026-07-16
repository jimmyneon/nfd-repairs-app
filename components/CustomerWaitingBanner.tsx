'use client'

import { useState } from 'react'
import { X, User } from 'lucide-react'
import Link from 'next/link'
import { Job } from '@/lib/types-v3'
import { hasCustomerArrived } from '@/lib/job-utils'

interface CustomerWaitingBannerProps {
  jobs: Job[]
  onAcknowledge?: (jobId: string) => void
}

export default function CustomerWaitingBanner({ jobs, onAcknowledge }: CustomerWaitingBannerProps) {
  const [acknowledgedJobs, setAcknowledgedJobs] = useState<Set<string>>(new Set())

  const waitingJobs = jobs.filter(job =>
    hasCustomerArrived(job) &&
    !acknowledgedJobs.has(job.id)
  )

  const handleAcknowledge = (jobId: string) => {
    setAcknowledgedJobs(prev => new Set([...Array.from(prev), jobId]))
    onAcknowledge?.(jobId)
  }

  if (waitingJobs.length === 0) return null

  return (
    <div className="sticky top-0 z-50">
      {waitingJobs.map((job) => (
        <div
          key={job.id}
          className="bg-green-600 text-white shadow-md"
        >
          <div className="max-w-7xl mx-auto px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/app/jobs/${job.id}?customer_arrived=true`}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <User className="h-4 w-4 flex-shrink-0" />
                <span className="font-bold text-sm truncate">
                  {job.customer_name} is here
                </span>
                <span className="text-xs text-white/70 flex-shrink-0">
                  {job.device_make} {job.device_model}
                </span>
              </Link>

              <button
                onClick={() => handleAcknowledge(job.id)}
                className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
