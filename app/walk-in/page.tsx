'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, AlertCircle, Send, ArrowLeft, ArrowRight } from 'lucide-react'

const TOTAL_STEPS = 3 // 0: name, 1: phone, 2: device, 3: summary

export default function WalkInSelfBookingPage() {
  const [loading, setLoading] = useState(false)
  const [finishLaterLoading, setFinishLaterLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [finishLaterSuccess, setFinishLaterSuccess] = useState(false)
  const [jobRef, setJobRef] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

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

  const goNext = () => {
    const errors: Record<string, string> = {}
    if (currentStep === 0 && !formData.customerName.trim()) {
      errors.customerName = 'Please enter your name'
    }
    if (currentStep === 1 && !formData.customerPhone.trim()) {
      errors.customerPhone = 'Please enter your mobile number'
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors({})
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setValidationErrors({})
    setCurrentStep(prev => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFinishLater = async () => {
    const errors: Record<string, string> = {}
    if (!formData.customerName.trim()) {
      errors.customerName = 'Please enter your name first'
    }
    if (!formData.customerPhone.trim()) {
      errors.customerPhone = 'Please enter your phone number first'
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setFinishLaterLoading(true)
    setError(null)

    try {
      const payload = {
        customer_name: formData.customerName.trim(),
        customer_phone: formData.customerPhone.trim(),
        customer_email: formData.customerEmail.trim() || null,
        device_type: formData.deviceType,
        device_make: 'To be added',
        device_model: 'To be added',
        issue: 'To be assessed',
        description: 'Customer started walk-in form but chose to finish later',
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
        device_in_shop: false,
        linked_quote_id: null,
        skip_sms: true,
        quick_intake: true,
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

        // Send custom SMS with completion link
        const completionUrl = `${window.location.origin}/walk-in/complete/${result.tracking_token}`
        const firstName = formData.customerName.trim().split(' ')[0]
        const smsMessage = `Hi ${firstName}, thanks for starting your check-in with New Forest Device Repairs. Please use this link to complete your details when you're ready:\n\n${completionUrl}\n\nMany thanks,\nNew Forest Device Repairs`

        await fetch('/api/sms/send-custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: result.job_id,
            message: smsMessage,
          }),
        })

        setFinishLaterSuccess(true)
      } else {
        setError(result.error || 'Failed to send link')
      }
    } catch (err) {
      console.error('Finish later error:', err)
      setError('Something went wrong. Please ask staff for help.')
    } finally {
      setFinishLaterLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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

  if (finishLaterSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full mb-6">
            <Send className="h-14 w-14 text-green-600 dark:text-green-400" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Link Sent!
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            We&apos;ve sent you an SMS with a link to complete your details. You can fill them in whenever you&apos;re ready.
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
              <li>1. Check your phone for an SMS from us</li>
              <li>2. Click the link to complete your device details</li>
              <li>3. We&apos;ll assess it and text you a quote</li>
            </ul>
          </div>
        </div>
      </div>
    )
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

  const stepLabels = ['Your Name', 'Your Phone', 'Device', 'Review']

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Check In Your Repair
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Fill in what you know below, then hand your device to staff
            </p>
          </div>

          {/* Progress bar */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  i <= currentStep
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                }`}>
                  {i < currentStep ? <CheckCircle className="h-5 w-5" /> : i + 1}
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`w-8 h-1 ${i < currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              {/* Step 0: Name */}
              {currentStep === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">What&apos;s your name?</h2>
                  <input
                    type="text"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleChange}
                    className={`w-full px-4 py-4 text-xl border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.customerName
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="Enter your full name"
                    autoFocus
                  />
                  {validationErrors.customerName && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerName}
                    </p>
                  )}
                </div>
              )}

              {/* Step 1: Phone + Email */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Your contact details</h2>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Mobile Phone *
                    </label>
                    <input
                      type="tel"
                      name="customerPhone"
                      value={formData.customerPhone}
                      onChange={handleChange}
                      className={`w-full px-4 py-4 text-xl border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                        validationErrors.customerPhone
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                      }`}
                      placeholder="07410 123 456"
                      autoFocus
                    />
                    {validationErrors.customerPhone && (
                      <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
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
                      className="w-full px-4 py-4 text-xl border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Device Info */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Device details</h2>
                  <label className="flex items-center space-x-3 cursor-pointer">
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
              )}

              {/* Step 3: Summary */}
              {currentStep === 3 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Review your details</h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                      <span className="text-gray-600 dark:text-gray-400">Name</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{formData.customerName}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                      <span className="text-gray-600 dark:text-gray-400">Phone</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{formData.customerPhone}</span>
                    </div>
                    {formData.customerEmail && (
                      <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Email</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{formData.customerEmail}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                      <span className="text-gray-600 dark:text-gray-400">Device</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formData.notSure ? 'Not sure — staff to assess' : `${formData.deviceMake || '?'} ${formData.deviceModel || '?'}`.trim()}
                      </span>
                    </div>
                    {!formData.notSure && (
                      <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Issue</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{formData.issue || 'Not specified'}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    Please hand your device to a member of staff after checking in.
                  </p>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-3">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>
              )}

              {currentStep < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-colors active:scale-95 text-lg"
                >
                  Next
                  <ArrowRight className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-95 text-white font-bold py-4 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-lg flex items-center justify-center gap-3"
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
              )}
            </div>

            {/* Send me a link — available from step 1 onwards (when phone is entered) */}
            {currentStep >= 1 && (
              <button
                type="button"
                onClick={handleFinishLater}
                disabled={finishLaterLoading}
                className="w-full flex items-center justify-center gap-2 text-primary hover:text-primary-dark font-semibold py-3 px-6 rounded-xl border-2 border-primary/30 hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                {finishLaterLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending link...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Just send me a link to finish later
                  </>
                )}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
