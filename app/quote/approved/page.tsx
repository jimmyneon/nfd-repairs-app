'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, MapPin } from 'lucide-react'
import Link from 'next/link'

function ApprovedContent() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 sm:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Quote Approved!
          </h1>
          
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Thank you for approving the quote. You can now bring your device to our shop.
          </p>

          {jobId && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8">
              <p className="text-sm text-blue-900 dark:text-blue-100 mb-4">
                <strong>What to do next:</strong>
              </p>
              <ul className="space-y-2 text-sm text-blue-900 dark:text-blue-100 text-left">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Bring your device to our shop during opening hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Mention your reference number when you arrive</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>If parts are required, bring £20.00 deposit</span>
                </li>
              </ul>
            </div>
          )}

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

export default function QuoteApprovedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <ApprovedContent />
    </Suspense>
  )
}
