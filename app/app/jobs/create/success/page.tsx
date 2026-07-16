'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, MessageSquare, Mail, Clock, MapPin } from 'lucide-react'

function BookingSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobRef = searchParams.get('job_ref')
  const email = searchParams.get('email')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('job_create_form_state')
      sessionStorage.removeItem('quote_customer_data')
      sessionStorage.removeItem('job_creation_overrides')
      sessionStorage.removeItem('customer_confirm_wizard')
    }
    const timer = setTimeout(() => {
      router.push('/app/jobs/create')
    }, 15000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-800">
      <main className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-3">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-1">All Set!</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Your repair is booked and in our queue</p>
          {jobRef && (
            <div className="inline-block bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Ref: </span>
              <span className="font-mono font-bold text-gray-900 dark:text-white">{jobRef}</span>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white mb-4">What happens next?</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Text sent</strong> with a tracking link - check your phone.</p>
            </div>
            {email && (
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Mail className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Also emailed</strong> to {email} - you can check it there later.</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Updates by text</strong> - we will message you at each stage.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <MapPin className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Collect when ready</strong> - we will text you when its done.</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-4">
          You can check your repair status anytime via the tracking link in your text message.
        </p>
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
