'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, MessageSquare, Bell, MapPin, Phone } from 'lucide-react'

function BookingSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobRef = searchParams.get('job_ref')

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      router.push('/app/jobs/create')
    }, 5000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-3">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Forest Device Repairs</h1>
          <p className="text-gray-600 dark:text-gray-400">Booking Confirmed</p>
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
              Repair Booked Successfully!
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Your device has been logged into our repair system
            </p>
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border-2 border-gray-100 dark:border-gray-700">
          <h3 className="font-black text-xl text-gray-900 dark:text-white mb-5 flex items-center">
            <Bell className="h-6 w-6 mr-2 text-primary" />
            What Happens Next?
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">SMS Confirmation Sent</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  The customer will receive a text message with a tracking link to monitor their repair progress
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">Automatic Updates</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  The customer will receive SMS notifications as the repair progresses through each stage
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <MapPin className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">Collection Notification</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  When the repair is complete, the customer will be notified to collect their device
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 rounded-2xl shadow-lg p-6 border-2 border-gray-100 dark:border-gray-700">
          <button
            onClick={() => router.push('/app/jobs/create')}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg mb-3"
          >
            Create Another Booking
          </button>
          <button
            onClick={() => router.push('/app/jobs')}
            className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-all"
          >
            View All Jobs
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            Auto-redirecting to new booking in 5 seconds...
          </p>
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
