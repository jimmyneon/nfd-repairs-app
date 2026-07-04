'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, AlertCircle, Smartphone } from 'lucide-react'

export default function WalkInSelfBookingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [jobRef, setJobRef] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)

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

  const issueOptions: Record<string, string[]> = {
    phone: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Data Recovery', 'Software Issues', 'Other'],
    tablet: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Software Issues', 'Other'],
    laptop: ['Screen Replacement', 'Keyboard Replacement', 'Battery Replacement', 'Charging Issues', 'Windows Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    macbook: ['Screen Replacement', 'Battery Replacement', 'Keyboard Replacement', 'Charging Issues', 'macOS Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    console: ['HDMI Port Replacement', 'Disc Drive Issues', 'Overheating', 'No Power', 'Software Issues', 'Controller Issues', 'Other'],
    other: ['Hardware Issue', 'Software Issue', 'Data Recovery', 'Other'],
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }

    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}

    if (!formData.customerName.trim()) {
      errors.customerName = 'Your name is required'
    }

    if (!formData.customerPhone.trim()) {
      errors.customerPhone = 'Your phone number is required'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setShowValidationSummary(true)
      const firstErrorField = Object.keys(errors)[0]
      const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => { (errorElement as HTMLElement).focus() }, 500)
      }
      setTimeout(() => setShowValidationSummary(false), 10000)
      return
    }

    setValidationErrors({})
    setShowValidationSummary(false)
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

          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-5 text-left">
            <h3 className="font-bold text-blue-900 dark:text-blue-100 text-lg mb-2">What happens next?</h3>
            <ul className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
              <li>1. Hand your device to a member of staff</li>
              <li>2. We&apos;ll assess it and text you a quote</li>
              <li>3. Track your repair via SMS updates</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Check In Your Repair
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Fill in what you know below, then hand your device to staff
            </p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Your Details */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.customerName
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="Enter your full name"
                    autoFocus
                  />
                  {validationErrors.customerName && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    name="customerPhone"
                    value={formData.customerPhone}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.customerPhone
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="07410 123 456"
                  />
                  {validationErrors.customerPhone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerPhone}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    name="customerEmail"
                    value={formData.customerEmail}
                    onChange={handleChange}
                    className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Device Information */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Information</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">Optional</span>
              </div>

              <div className="space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    name="notSure"
                    checked={formData.notSure}
                    onChange={handleChange}
                    className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    I&apos;m not sure — let staff figure it out
                  </span>
                </label>

                {!formData.notSure && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Device Type
                      </label>
                      <select
                        name="deviceType"
                        value={formData.deviceType}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="phone">Phone</option>
                        <option value="tablet">Tablet</option>
                        <option value="laptop">Laptop (Windows)</option>
                        <option value="macbook">MacBook (Apple)</option>
                        <option value="console">Games Console</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Device Make
                      </label>
                      <input
                        type="text"
                        name="deviceMake"
                        value={formData.deviceMake}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g., Apple, Samsung, HP"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Device Model
                      </label>
                      <input
                        type="text"
                        name="deviceModel"
                        value={formData.deviceModel}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g., iPhone 14 Pro, Galaxy S23"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        What&apos;s the issue?
                      </label>
                      <select
                        name="issue"
                        value={formData.issue}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select an issue...</option>
                        {(issueOptions[formData.deviceType] || []).map(issue => (
                          <option key={issue} value={issue}>{issue}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Additional Details (Optional)
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Tell us more about the problem..."
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {showValidationSummary && Object.keys(validationErrors).length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-700 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-red-900 dark:text-red-100 text-lg mb-2">Please complete the following required fields:</h3>
                    <ul className="space-y-1">
                      {Object.entries(validationErrors).map(([field, message]) => (
                        <li key={field} className="text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-red-600 dark:bg-red-400 rounded-full"></span>
                          <strong>{message}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowValidationSummary(false)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-95 text-white font-bold py-5 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Checking In...
                </>
              ) : (
                <>
                  <CheckCircle className="h-6 w-6" />
                  Check In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
