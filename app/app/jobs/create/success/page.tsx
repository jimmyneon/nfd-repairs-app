'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, MessageSquare, Bell, MapPin, Phone } from 'lucide-react'

function BookingSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobRef = searchParams.get('job_ref')

  useEffect(() => {
    // Auto-redirect after 15 seconds
    const timer = setTimeout(() => {
      router.push('/app/jobs/create')
    }, 15000)

    // Auto-scroll to show all content
    const scrollTimer = setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 2000)

    return () => {
      clearTimeout(timer)
      clearTimeout(scrollTimer)
    }
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-3">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Forest Device Repairs</h1>
          <p className="text-gray-600 dark:text-gray-400">Your Repair is Booked</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Confirmation Message */}
        <div className="bg-gradient-to-br from-green-50 to-white dark:from-gray-800 dark:to-gray-700 rounded-2xl shadow-lg p-6 border-2 border-green-200 dark:border-green-800">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-3">
              We've Got Your Repair!
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Your device is now in our queue and we'll get started as soon as possible
            </p>
            {jobRef && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Reference: <span className="font-mono font-bold">{jobRef}</span>
              </p>
            )}
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border-2 border-gray-100 dark:border-gray-700">
          <h3 className="font-black text-xl text-gray-900 dark:text-white mb-5 flex items-center">
            <Bell className="h-6 w-6 mr-2 text-primary" />
            What Happens Next?
          </h3>
          
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">1. You'll Receive a Tracking Link</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We've sent you a text message with a link to track your repair. You can check the status anytime, 24/7.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">2. We'll Keep You Updated</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use the tracking link to check progress anytime. If you provided an email, we'll send detailed updates at each stage. You'll get a text when your repair is ready for collection.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">3. We'll Work to Your Timescale</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We'll complete your repair based on the timescales discussed. If anything changes, we'll let you know immediately.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <MapPin className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">4. Collection Time</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  When your repair is complete, we'll send you a notification. You can then collect your device at your convenience.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-redirect notice */}
        <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 rounded-2xl shadow-lg p-6 border-2 border-gray-100 dark:border-gray-700 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This page will close automatically in a few moments...
          </p>
        </div>

        {/* Scroll indicator - subtle */}
        <div className="flex justify-center pb-4">
          <div className="flex flex-col items-center gap-1 text-gray-400 dark:text-gray-600 animate-bounce">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-xs">Scroll for more</span>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <BookingSuccessContent />
    </Suspense>
  )
}
