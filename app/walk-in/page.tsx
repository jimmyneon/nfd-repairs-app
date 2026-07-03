'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, AlertCircle, Smartphone, Wrench } from 'lucide-react'
import { SHOP_INFO } from '@/lib/constants'

export default function WalkInSelfBookingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [jobRef, setJobRef] = useState('')

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    deviceType: 'phone' as string,
    deviceMake: '',
    deviceModel: '',
    issue: '',
    description: '',
    notSure: false,
  })

  const deviceTypes = [
    { value: 'phone', label: 'Phone', icon: Smartphone },
    { value: 'tablet', label: 'Tablet', icon: Smartphone },
    { value: 'laptop', label: 'Laptop', icon: Wrench },
    { value: 'macbook', label: 'MacBook', icon: Wrench },
    { value: 'console', label: 'Console', icon: Wrench },
    { value: 'other', label: 'Other', icon: Wrench },
  ]

  const issueOptions: Record<string, string[]> = {
    phone: ['Screen Replacement', 'Battery Replacement', 'Charging Port', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Software Issues', 'Other'],
    tablet: ['Screen Replacement', 'Battery Replacement', 'Charging Port', 'Not Charging', 'Water Damage', 'No Power', 'Software Issues', 'Other'],
    laptop: ['Screen Replacement', 'Keyboard', 'Battery', 'Charging Issues', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    macbook: ['Screen Replacement', 'Battery', 'Keyboard', 'Charging Issues', 'macOS Issues', 'Software Issues', 'Hardware Diagnostics', 'Other'],
    console: ['HDMI Port', 'Disc Drive', 'Overheating', 'No Power', 'Software Issues', 'Controller Issues', 'Other'],
    other: ['Hardware Issue', 'Software Issue', 'Data Recovery', 'Other'],
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.customerName.trim() || !formData.customerPhone.trim()) {
      setError('Please enter your name and phone number')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const payload = {
        customer_name: formData.customerName.trim(),
        customer_phone: formData.customerPhone.trim(),
        customer_email: formData.customerEmail.trim() || null,
        device_type: formData.deviceType,
        device_make: formData.deviceMake.trim() || 'Unknown',
        device_model: formData.deviceModel.trim() || 'Unknown',
        issue: formData.notSure ? 'To be assessed' : (formData.issue.trim() || 'To be assessed'),
        description: formData.description.trim() || null,
        price_total: 0,
        quoted_price: 0,
        requires_parts_order: false,
        source: 'walk_in_self',
        device_password: null,
        password_not_applicable: true,
        passcode_requirement: 'not_required',
        customer_signature: null,
        terms_accepted: true,
        onboarding_completed: false,
        device_in_shop: true,
        linked_quote_id: null,
        skip_sms: false,
        initial_status: 'RECEIVED',
      }

      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        setJobRef(result.job_ref)
        setSuccess(true)
      } else {
        setError(result.error || 'Failed to create booking')
      }
    } catch (err) {
      console.error('Walk-in booking error:', err)
      setError('Something went wrong. Please ask staff for help.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <CheckCircle className="h-14 w-14 text-green-600 dark:text-green-400" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            You&apos;re Booked In!
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            Please hand your device to a member of staff.
          </p>

          {jobRef && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-6">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Your Reference
              </p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                {jobRef}
              </p>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-5 text-left">
            <h2 className="font-bold text-gray-900 dark:text-white mb-2 text-sm">What happens next?</h2>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span>Hand your device to staff</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span>We&apos;ll assess your device and text you a quote</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span>Track your repair status via SMS updates</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-3">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Welcome to {SHOP_INFO.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Quick check-in — just a few details and you&apos;re done
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Details - Required */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 space-y-4">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">Your Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                required
                autoComplete="name"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="customerPhone"
                value={formData.customerPhone}
                onChange={handleChange}
                required
                autoComplete="tel"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
                placeholder="07410 123 456"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                We&apos;ll text you updates about your repair
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="email"
                name="customerEmail"
                value={formData.customerEmail}
                onChange={handleChange}
                autoComplete="email"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="you@email.com"
              />
            </div>
          </div>

          {/* Device Details - Optional */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Device Details</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">Optional</span>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Fill in what you know — leave the rest to us. We&apos;ll check your device when you hand it in.
            </p>

            {/* Not sure toggle */}
            <label className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl cursor-pointer border-2 border-blue-200 dark:border-blue-800">
              <input
                type="checkbox"
                name="notSure"
                checked={formData.notSure}
                onChange={handleChange}
                className="w-5 h-5 rounded text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                I&apos;m not sure — let staff figure it out
              </span>
            </label>

            {!formData.notSure && (
              <>
                {/* Device type quick select */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    What type of device?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {deviceTypes.map(dt => {
                      const Icon = dt.icon
                      return (
                        <button
                          key={dt.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, deviceType: dt.value }))}
                          className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all ${
                            formData.deviceType === dt.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{dt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Make / Brand
                  </label>
                  <input
                    type="text"
                    name="deviceMake"
                    value={formData.deviceMake}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. Apple, Samsung, Sony"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    name="deviceModel"
                    value={formData.deviceModel}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. iPhone 14, Galaxy S23, PS5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    What&apos;s the issue?
                  </label>
                  <select
                    name="issue"
                    value={formData.issue}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select an issue...</option>
                    {(issueOptions[formData.deviceType] || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Anything else we should know?
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    placeholder="Optional - describe the problem in your own words"
                  />
                </div>
              </>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-2xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Booking in...
              </>
            ) : (
              'Check In'
            )}
          </button>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-4">
            By checking in, you agree to our terms. No payment until you approve a quote.
          </p>
        </form>
      </div>
    </div>
  )
}
