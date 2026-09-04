'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, FileQuestion, Home, Loader2, MessageSquareText, Smartphone } from 'lucide-react'

export default function SendCustomerFormPage() {
  const [phone, setPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [formType, setFormType] = useState<'quote' | 'walk_in'>('quote')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!phone.trim()) return setError('Enter the customer’s mobile number')
    setLoading(true)
    setError('')
    setSent(false)
    try {
      const response = await fetch('/api/sms/send-form-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, customerName, formType }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to send the form')
      setSent(true)
      setPhone('')
      setCustomerName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the form')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/app/jobs" className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700"><Home className="h-5 w-5 text-primary" /></Link>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Send a customer form</h1><p className="text-xs text-gray-500">Phone number, choose form, send</p></div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4">
        <form onSubmit={submit} noValidate className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 sm:p-7 space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-gray-900 dark:text-white mb-2">What does the customer need?</legend>
            <label className={`flex gap-3 p-4 rounded-xl border-2 cursor-pointer ${formType === 'quote' ? 'border-primary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
              <input type="radio" checked={formType === 'quote'} onChange={() => setFormType('quote')} className="mt-1" />
              <FileQuestion className="h-6 w-6 text-primary" />
              <span><strong className="block text-gray-900 dark:text-white">Request a quote</strong><span className="text-xs text-gray-500">For an enquiry when no device is being left</span></span>
            </label>
            <label className={`flex gap-3 p-4 rounded-xl border-2 cursor-pointer ${formType === 'walk_in' ? 'border-primary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
              <input type="radio" checked={formType === 'walk_in'} onChange={() => setFormType('walk_in')} className="mt-1" />
              <Smartphone className="h-6 w-6 text-primary" />
              <span><strong className="block text-gray-900 dark:text-white">Fill in at the counter</strong><span className="text-xs text-gray-500">For someone waiting with their own phone</span></span>
            </label>
          </fieldset>

          <label className="block"><span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Customer name <span className="font-normal text-gray-400">Optional</span></span><input value={customerName} onChange={event => setCustomerName(event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white" placeholder="First name is enough" /></label>
          <label className="block"><span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mobile number</span><input type="tel" value={phone} onChange={event => { setPhone(event.target.value); setError(''); setSent(false) }} autoFocus className={`w-full px-4 py-4 text-xl border-2 rounded-xl bg-white dark:bg-gray-700 dark:text-white ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`} placeholder="07…" /></label>

          {error && <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 font-semibold text-sm">{error}</p>}
          {sent && <p className="p-3 rounded-xl bg-green-50 text-green-800 font-semibold text-sm flex items-center gap-2"><CheckCircle className="h-5 w-5" />Form link sent successfully</p>}

          <button type="submit" disabled={loading} className="w-full py-4 rounded-xl bg-primary text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50">{loading ? <><Loader2 className="h-5 w-5 animate-spin" />Sending…</> : <><MessageSquareText className="h-5 w-5" />Send form by SMS</>}</button>
        </form>
      </main>
    </div>
  )
}
