'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, Lock, Unlock, AlertCircle, Smartphone } from 'lucide-react'

export default function CustomerConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [devicePassword, setDevicePassword] = useState('')
  const [passwordNA, setPasswordNA] = useState(false)
  const [passcodeMethod, setPasscodeMethod] = useState('provided')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Get job data from URL params
  const jobData = {
    device_make: searchParams.get('device_make') || '',
    device_model: searchParams.get('device_model') || '',
    device_type: searchParams.get('device_type') || '',
    issue: searchParams.get('issue') || '',
    description: searchParams.get('description') || '',
    price_total: searchParams.get('price_total') || '0',
    requires_parts_order: searchParams.get('requires_parts_order') === 'true',
    device_left_with_us: searchParams.get('device_left_with_us') === 'true',
    passcode_requirement: searchParams.get('passcode_requirement') || 'recommended',
    linked_quote_id: searchParams.get('linked_quote_id') || null,
  }

  const isSmallDevice = ['phone', 'tablet', 'watch'].includes(jobData.device_type)
  const diagnosticFee = isSmallDevice ? '£20' : '£40'

  // Auto-scroll to current step
  useEffect(() => {
    const element = document.getElementById(`step-${currentStep}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [currentStep])

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      alert('Please enter your full name')
      return
    }

    if (!customerPhone.trim()) {
      alert('Please enter your mobile phone number')
      return
    }

    if (jobData.passcode_requirement !== 'not_required') {
      if (passcodeMethod === 'provided' && !passwordNA && !devicePassword.trim()) {
        alert('Please enter your device passcode or select another option')
        return
      }
    }

    if (!termsAccepted) {
      alert('Please accept the terms and conditions to proceed')
      return
    }

    setLoading(true)

    try {
      const payload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        device_type: jobData.device_type,
        device_make: jobData.device_make,
        device_model: jobData.device_model,
        issue: jobData.issue,
        description: jobData.description || null,
        price_total: parseFloat(jobData.price_total) || 0,
        quoted_price: parseFloat(jobData.price_total) || 0,
        requires_parts_order: jobData.requires_parts_order,
        source: 'staff_manual',
        device_password: (passwordNA || passcodeMethod !== 'provided') ? null : devicePassword,
        password_not_applicable: passwordNA || passcodeMethod === 'not_applicable',
        passcode_requirement: jobData.passcode_requirement,
        passcode_method: passcodeMethod,
        customer_signature: null,
        terms_accepted: true,
        onboarding_completed: true,
        device_in_shop: jobData.device_left_with_us,
        linked_quote_id: jobData.linked_quote_id,
      }

      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        // Show success and redirect
        router.push(`/app/jobs/create/success?job_ref=${result.job.job_ref}`)
      } else {
        alert(`Failed to create job: ${result.error}`)
        setLoading(false)
      }
    } catch (error) {
      console.error('Error creating job:', error)
      alert('Failed to create job. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          
          {/* Left: Customer Form */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Your Details */}
            <div id="step-1" className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 lg:p-8">
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
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      if (e.target.value && currentStep === 1) setCurrentStep(2)
                    }}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter your full name"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      if (e.target.value && currentStep === 2) setCurrentStep(3)
                    }}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="07410 123 456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Device Passcode */}
            {jobData.passcode_requirement !== 'not_required' && (
              <div id="step-2" className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Passcode</h2>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Why we need this:</strong> We need your device passcode to test it after repair and ensure everything works properly.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-start space-x-3 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <input
                      type="radio"
                      name="passcode_method"
                      value="provided"
                      checked={passcodeMethod === 'provided'}
                      onChange={(e) => {
                        setPasscodeMethod(e.target.value)
                        setPasswordNA(false)
                        if (currentStep === 3) setCurrentStep(4)
                      }}
                      className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        I'll provide my passcode now
                      </div>
                      {passcodeMethod === 'provided' && (
                        <input
                          type="text"
                          value={devicePassword}
                          onChange={(e) => setDevicePassword(e.target.value)}
                          className="w-full px-4 py-3 mt-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-mono"
                          placeholder="Enter passcode"
                        />
                      )}
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <input
                      type="radio"
                      name="passcode_method"
                      value="will_provide_later"
                      checked={passcodeMethod === 'will_provide_later'}
                      onChange={(e) => {
                        setPasscodeMethod(e.target.value)
                        setPasswordNA(false)
                        if (currentStep === 3) setCurrentStep(4)
                      }}
                      className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">I'll provide it when I drop off the device</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">You can give us the passcode when you bring your device in</div>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <input
                      type="radio"
                      name="passcode_method"
                      value="not_applicable"
                      checked={passcodeMethod === 'not_applicable'}
                      onChange={(e) => {
                        setPasscodeMethod(e.target.value)
                        setPasswordNA(true)
                        if (currentStep === 3) setCurrentStep(4)
                      }}
                      className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Unlock className="h-5 w-5" />
                        No passcode / Not applicable
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Device has no passcode or it's not needed</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Step 3: Terms & Diagnostic Fee */}
            <div id="step-3" className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  {jobData.passcode_requirement !== 'not_required' ? '3' : '2'}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Final Step</h2>
              </div>

              <div className="space-y-6">
                {/* Diagnostic Fee */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white mb-2">Diagnostic Fee: {diagnosticFee}</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        A diagnostic fee of {diagnosticFee} applies if you choose not to proceed with the repair after diagnosis. This fee is waived if you proceed with the repair.
                      </p>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          I understand and accept the diagnostic fee policy and terms & conditions
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || !termsAccepted || !customerName || !customerPhone}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-5 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-lg flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      Creating Booking...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-6 w-6" />
                      Confirm Booking
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Device Info Summary (Sticky) */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 lg:sticky lg:top-8">
              <div className="flex items-center gap-3 mb-6">
                <Smartphone className="h-8 w-8 text-primary" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Repair Summary</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Device</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-lg">
                    {jobData.device_make} {jobData.device_model}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Issue</div>
                  <div className="font-semibold text-gray-900 dark:text-white">{jobData.issue}</div>
                </div>

                {jobData.description && (
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Description</div>
                    <div className="text-gray-700 dark:text-gray-300 text-sm">{jobData.description}</div>
                  </div>
                )}

                {parseFloat(jobData.price_total) > 0 && (
                  <div className="pt-4 border-t-2 border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Repair Price</div>
                    <div className="font-bold text-gray-900 dark:text-white text-2xl">
                      £{parseFloat(jobData.price_total).toFixed(2)}
                    </div>
                  </div>
                )}

                {jobData.requires_parts_order && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                    <div className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                      Parts Required
                    </div>
                    <div className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                      £20 deposit needed for parts order
                    </div>
                  </div>
                )}

                <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl p-4">
                  <div className="text-sm font-semibold text-green-900 dark:text-green-100">
                    Device Status
                  </div>
                  <div className="text-sm text-green-800 dark:text-green-200 mt-1">
                    {jobData.device_left_with_us ? 'Left with us for repair' : 'Taking home (awaiting parts)'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
