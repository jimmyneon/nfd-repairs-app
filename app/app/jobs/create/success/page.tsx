'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-12 max-w-2xl w-full text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Booking Confirmed!
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Your repair has been successfully booked in
          </p>

          {jobRef && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-8">
              <div className="text-sm text-blue-900 dark:text-blue-100 mb-2">
                Job Reference Number
              </div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                {jobRef}
              </div>
            </div>
          )}

          <div className="text-gray-600 dark:text-gray-400 mb-8">
            <p className="mb-2">✅ Customer will receive SMS confirmation</p>
            <p className="mb-2">✅ Job added to repair queue</p>
            <p>✅ Notifications enabled</p>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            Redirecting to new booking in 5 seconds...
          </div>
        </div>

        <button
          onClick={() => router.push('/app/jobs/create')}
          className="bg-primary hover:bg-primary-dark text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg"
        >
          Create Another Booking
        </button>
      </div>
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
