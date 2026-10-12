'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, MapPin, CreditCard, Loader2 } from 'lucide-react'
import Link from 'next/link'

function ApprovedContent() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')
  const quoteToken = searchParams.get('t')
  const [hours, setHours] = useState<any>(null)
  const [paying, setPaying] = useState<'deposit' | 'full' | 'fund' | null>(null)
  const [payError, setPayError] = useState('')

  const startFund = async () => {
    if (!jobId || !quoteToken) return
    setPaying('fund')
    setPayError('')
    try {
      const res = await fetch('/api/repair-fund/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry_ref: jobId, t: quoteToken }),
      })
      const data = await res.json()
      if (data?.fund_url) {
        window.location.href = data.fund_url
        return
      }
      setPayError(data?.error || 'Could not set up a repair fund — text us and we will sort it.')
    } catch {
      setPayError('Could not set up a repair fund — text us and we will sort it.')
    }
    setPaying(null)
  }

  const startCheckout = async (kind: 'enquiry_deposit' | 'enquiry_payment') => {
    if (!jobId || !quoteToken) return
    setPaying(kind === 'enquiry_deposit' ? 'deposit' : 'full')
    setPayError('')
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          enquiry_ref: jobId,
          t: quoteToken,
          return_url: 'https://newforestdevicerepairs.co.uk/pay/thanks/',
        }),
      })
      const data = await res.json()
      if (data?.url) {
        window.location.href = data.url
        return
      }
      setPayError(data?.error || 'Could not start checkout — please try again or wait for our payment link.')
    } catch {
      setPayError('Could not start checkout — please try again or wait for our payment link.')
    }
    setPaying(null)
  }

  useEffect(() => {
    fetch('/api/public/opening-hours')
      .then(res => res.json())
      .then(data => setHours(data))
      .catch(() => {})
  }, [])

  const isOpen = hours?.currentStatus?.isOpen
  const nextOpen = hours?.nextOpen
  const todayHours = hours?.today

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4 pt-24">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 sm:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Quote Approved!
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Thanks for approving your quote. We'll be in touch with the next steps during our opening hours.
          </p>

          {jobId && (
            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-6 mb-6">
              <p className="text-sm text-green-900 dark:text-green-100">
                <strong>What happens next:</strong>
              </p>
              <ul className="space-y-2 text-sm text-green-900 dark:text-green-100 text-left mt-3">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>We'll get back to you during opening hours with what to do next</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>If we need to order any parts, we'll let you know the turnaround time and arrange a £20 deposit</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>No payment needed until we've confirmed everything with you</span>
                </li>
              </ul>
            </div>
          )}

          {/* Optional: pay now — deposit or full payment via Stripe/Klarna */}
          {jobId && quoteToken && (
            <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-6 mb-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Want to pay now? (optional)</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Skip the queue — pay a deposit or the full amount securely with Stripe. Klarna is offered on eligible payments.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => startCheckout('enquiry_deposit')}
                  disabled={paying !== null}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {paying === 'deposit' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Pay deposit
                </button>
                <button
                  onClick={() => startCheckout('enquiry_payment')}
                  disabled={paying !== null}
                  className="flex-1 bg-gray-900 hover:bg-black disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {paying === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Pay in full
                </button>
              </div>
              <button
                onClick={startFund}
                disabled={paying !== null}
                className="w-full mt-3 bg-white hover:bg-green-50 border-2 border-green-600 text-green-700 font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {paying === 'fund' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Can't pay yet? Start a repair fund for this quote
              </button>
              {payError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-3">{payError}</p>
              )}
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
                Klarna's Pay in 3 / Pay in 30 days are unregulated credit agreements. Borrowing more than you can afford or paying late may negatively impact your financial status and credit score. 18+, UK residents only. T&Cs and late fees apply.
              </p>
            </div>
          )}

          {/* Dynamic opening hours */}
          {hours && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Our Opening Hours</p>
                {isOpen ? (
                  <span className="ml-auto text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
                    Open Now
                  </span>
                ) : (
                  <span className="ml-auto text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-3 py-1 rounded-full">
                    Closed
                  </span>
                )}
              </div>

              {todayHours && (
                <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">
                  <strong>Today ({todayHours.day}):</strong>{' '}
                  {todayHours.isOpen ? todayHours.hours : 'Closed'}
                </p>
              )}

              {!isOpen && nextOpen && (
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  Next open: <strong>{nextOpen}</strong>
                </p>
              )}

              {/* Weekly schedule */}
              {hours.weeklySchedule && (
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                  <div className="space-y-1">
                    {hours.weeklySchedule.map((day: any) => (
                      <div key={day.day} className="flex justify-between text-xs text-blue-900 dark:text-blue-100">
                        <span className={day.day === todayHours?.day ? 'font-bold' : ''}>{day.day}</span>
                        <span className={day.isOpen ? '' : 'text-red-600 dark:text-red-400'}>
                          {day.isOpen ? day.formatted : 'Closed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hours.googleMapsUrl && (
                <a
                  href={hours.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  Find us on Google Maps
                </a>
              )}
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400">
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
