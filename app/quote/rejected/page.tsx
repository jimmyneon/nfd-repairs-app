'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { XCircle } from 'lucide-react'
import Link from 'next/link'

function RejectedContent() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 sm:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full mb-6">
            <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Quote Rejected
          </h1>
          
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            You've chosen not to proceed with this quote. No problem at all!
          </p>

          {jobId && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-8">
              <p className="text-sm text-gray-900 dark:text-gray-100 mb-4">
                <strong>What happens next:</strong>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 text-left">
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 mt-0.5">•</span>
                  <span>Your quote request has been cancelled</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 mt-0.5">•</span>
                  <span>If you change your mind, feel free to submit a new quote request</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 mt-0.5">•</span>
                  <span>We're here if you have any questions about the quote</span>
                </li>
              </ul>
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-4">
              If you'd like to discuss the quote or get a second opinion, please don't hesitate to contact us.
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

export default function QuoteRejectedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    }>
      <RejectedContent />
    </Suspense>
  )
}
