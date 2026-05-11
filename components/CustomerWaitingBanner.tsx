'use client'

import { useEffect, useState } from 'react'
import { Bell, X, User, Clock } from 'lucide-react'
import Link from 'next/link'
import { Job } from '@/lib/types-v3'
import { hasCustomerArrived } from '@/lib/job-utils'

interface CustomerWaitingBannerProps {
  jobs: Job[]
  onAcknowledge?: (jobId: string) => void
}

export default function CustomerWaitingBanner({ jobs, onAcknowledge }: CustomerWaitingBannerProps) {
  const [acknowledgedJobs, setAcknowledgedJobs] = useState<Set<string>>(new Set())
  const [audioEnabled, setAudioEnabled] = useState(false)
  
  // Filter jobs where customer has arrived and not been acknowledged
  const waitingJobs = jobs.filter(job => 
    hasCustomerArrived(job) && 
    !acknowledgedJobs.has(job.id)
  )

  // Calculate time since arrival
  const getTimeSinceArrival = (arrivedAt: string) => {
    const now = new Date()
    const arrived = new Date(arrivedAt)
    const minutes = Math.floor((now.getTime() - arrived.getTime()) / (1000 * 60))
    
    if (minutes < 1) return 'Just now'
    if (minutes === 1) return '1 min ago'
    return `${minutes} mins ago`
  }

  // Play notification sound
  useEffect(() => {
    if (waitingJobs.length > 0 && audioEnabled) {
      // Create audio element
      const audio = new Audio('/notification.mp3')
      audio.volume = 0.5
      
      // Play sound
      audio.play().catch(err => {
        console.log('Audio playback failed:', err)
      })
      
      // Repeat every 2 minutes until acknowledged
      const interval = setInterval(() => {
        if (waitingJobs.length > 0) {
          audio.play().catch(err => console.log('Audio playback failed:', err))
        }
      }, 120000) // 2 minutes
      
      return () => clearInterval(interval)
    }
  }, [waitingJobs.length, audioEnabled])

  // Load audio preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('customerArrivalAudioEnabled')
    setAudioEnabled(saved === 'true')
  }, [])

  const handleAcknowledge = (jobId: string) => {
    setAcknowledgedJobs(prev => new Set([...Array.from(prev), jobId]))
    onAcknowledge?.(jobId)
  }

  const toggleAudio = () => {
    const newValue = !audioEnabled
    setAudioEnabled(newValue)
    localStorage.setItem('customerArrivalAudioEnabled', String(newValue))
  }

  if (waitingJobs.length === 0) return null

  return (
    <div className="sticky top-0 z-50 animate-pulse-slow">
      {waitingJobs.map((job) => (
        <div
          key={job.id}
          className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-2xl border-b-4 border-green-700"
        >
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Left side - Alert info */}
              <div className="flex items-center gap-4 flex-1">
                <div className="flex items-center justify-center w-12 h-12 bg-white rounded-full animate-bounce">
                  <Bell className="h-6 w-6 text-green-600" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold">👋 CUSTOMER WAITING</h3>
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                      {job.job_ref}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      <span className="font-medium">{job.customer_name}</span>
                    </div>
                    <div className="hidden sm:block">•</div>
                    <div className="hidden sm:block">
                      {job.device_make} {job.device_model}
                    </div>
                    <div className="hidden md:block">•</div>
                    <div className="hidden md:flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span>Arrived {getTimeSinceArrival(job.customer_arrived_at!)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side - Actions */}
              <div className="flex items-center gap-2">
                {/* Audio toggle */}
                <button
                  onClick={toggleAudio}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
                  title={audioEnabled ? 'Disable audio alerts' : 'Enable audio alerts'}
                >
                  <span className="text-xl">{audioEnabled ? '🔔' : '🔕'}</span>
                  <span className="hidden lg:inline">
                    {audioEnabled ? 'Audio On' : 'Audio Off'}
                  </span>
                </button>

                {/* View Job button */}
                <Link
                  href={`/app/jobs/${job.id}?customer_arrived=true`}
                  className="px-4 py-2 bg-white text-green-600 hover:bg-green-50 rounded-lg font-bold transition-colors shadow-lg"
                >
                  View Job
                </Link>

                {/* Acknowledge button */}
                <button
                  onClick={() => handleAcknowledge(job.id)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="Acknowledge (hide this alert)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
