'use client'

import { useSearchParams } from 'next/navigation'
import { CheckCircle, Smartphone } from 'lucide-react'
import { Suspense } from 'react'
import Link from 'next/link'

function SuccessContent() {
  const searchParams = useSearchParams()
  const jobRef = searchParams.get('job_ref')

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 sm:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Quote Request Received!
          </h1>
          
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Thank you for your quote request. We'll review your device details and send you a quote via SMS.
          </p>

          {jobRef && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Your Reference Number
                </p>
              </div>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                {jobRef}
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-200 mt-2">
                Keep this reference number for your records
              </p>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-8 text-left">
            <h2 className="font-bold text-gray-900 dark:text-white mb-3">What happens next?</h2>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                <span>We'll review your device details and assess the repair</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                <span>You'll receive a quote via SMS with a link to approve</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                <span>Once you approve the quote, you can bring in your device</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                <span>No commitment until you approve the quote</span>
              </li>
            </ul>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-4">
              If you have any questions, please don't hesitate to contact us.
            </p>
            <Link 
              href="/"
              className="inline-block bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
