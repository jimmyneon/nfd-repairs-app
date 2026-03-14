'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, Lock, Unlock, AlertCircle, Smartphone } from 'lucide-react'

function CustomerConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [devicePassword, setDevicePassword] = useState('')
  const [passwordNA, setPasswordNA] = useState(false)
  const [passcodeMethod, setPasscodeMethod] = useState('provided')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [shakeTerms, setShakeTerms] = useState(false)
  const [isLandline, setIsLandline] = useState(false)
  const [landlineAccepted, setLandlineAccepted] = useState(false)

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

  // No auto-scroll - customer controls their own navigation on tablet

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      alert('Please enter your full name')
      return
    }

    if (!customerPhone.trim()) {
      alert('Please enter your mobile phone number')
      return
    }

    if (isLandline && !landlineAccepted) {
      alert('Please accept the additional charge for using a landline number, or provide a mobile number instead')
      return
    }

    if (!termsAccepted) {
      // Trigger shake animation to draw attention to terms checkbox
      setShakeTerms(true)
      setTimeout(() => setShakeTerms(false), 600)
      // Scroll to terms section smoothly
      const termsSection = document.getElementById('terms-section')
      termsSection?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (jobData.passcode_requirement !== 'not_required') {
      if (passcodeMethod === 'provided' && !passwordNA && !devicePassword.trim()) {
        alert('Please enter your device passcode or select another option')
        return
      }
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
                    onChange={(e) => setCustomerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customerName.trim()) {
                        e.preventDefault()
                        document.querySelector<HTMLInputElement>('input[type="tel"]')?.focus()
                      }
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
                      const phone = e.target.value
                      setCustomerPhone(phone)
                      // Check if it's a UK landline (starts with 01, 02, or 03)
                      const cleanPhone = phone.replace(/\s/g, '')
                      const isLandlineNumber = /^(01|02|03)/.test(cleanPhone)
                      setIsLandline(isLandlineNumber)
                      if (!isLandlineNumber) {
                        setLandlineAccepted(false)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customerPhone.trim()) {
                        e.preventDefault()
                        document.querySelector<HTMLInputElement>('input[type="email"]')?.focus()
                      }
                    }}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="07410 123 456"
                  />
                  {isLandline && (
                    <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
                      <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold mb-2">
                        Landline Number Detected
                      </p>
                      <p className="text-xs text-orange-800 dark:text-orange-200 mb-3">
                        Our system automatically sends SMS notifications to keep you updated. Landline numbers require manual phone calls from our team, which takes significantly more time.
                      </p>
                      <label className="flex items-start space-x-3 cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={landlineAccepted}
                          onChange={(e) => setLandlineAccepted(e.target.checked)}
                          className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 flex-shrink-0"
                        />
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          I understand there is an additional £20 charge for using a landline number due to the extra manual work required by your team.
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email (Optional)
                  </label>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl p-3 mb-3">
                    <p className="text-xs text-blue-900 dark:text-blue-100">
                      <strong>With email:</strong> Receive detailed repair information and updates throughout the entire process.
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                      <strong>Without email:</strong> Receive SMS tracking link to check status anytime, plus notification when device is ready for collection.
                    </p>
                  </div>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // Focus on next section if passcode required
                        if (jobData.passcode_requirement !== 'not_required') {
                          document.querySelector<HTMLInputElement>('input[type="radio"]')?.focus()
                        }
                      }
                    }}
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
                  <p className="text-xs text-blue-800 dark:text-blue-200 mt-2">
                    🔒 <strong>Security:</strong> Your passcode will be stored securely and automatically deleted 7 days after your repair is completed.
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
                      }}
                      className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        Provide passcode now
                      </div>
                      {passcodeMethod === 'provided' && (
                        <div className="mt-3 relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={devicePassword}
                            onChange={(e) => setDevicePassword(e.target.value)}
                            className="w-full px-4 py-3 pr-12 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-mono"
                            placeholder="Enter passcode"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {showPassword ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <input
                      type="radio"
                      name="passcode_method"
                      value="send_link"
                      checked={passcodeMethod === 'send_link'}
                      onChange={(e) => {
                        setPasscodeMethod(e.target.value)
                        setPasswordNA(false)
                      }}
                      className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">Send me a link to provide it later</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">We'll text you a secure link to enter your passcode when convenient</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Submit Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  {jobData.passcode_requirement !== 'not_required' ? '3' : '2'}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Ready to Confirm?</h2>
              </div>

              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Please review the repair summary and terms on the right, then click below to confirm your booking.
              </p>

              {/* Submit Button */}
              <div className="relative group">
                <button
                  onClick={handleSubmit}
                  disabled={loading || !termsAccepted || !customerName || !customerPhone || (isLandline && !landlineAccepted)}
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
                {(loading || !termsAccepted || !customerName || !customerPhone || (isLandline && !landlineAccepted)) && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    {!customerName && 'Please enter your name'}
                    {customerName && !customerPhone && 'Please enter your phone number'}
                    {customerName && customerPhone && isLandline && !landlineAccepted && 'Please accept landline charge'}
                    {customerName && customerPhone && (!isLandline || landlineAccepted) && !termsAccepted && 'Please accept terms & conditions'}
                  </div>
                )}
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

                {jobData.price_total && parseFloat(jobData.price_total) > 0 && (
                  <div className="pt-4 border-t-2 border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Repair Price</div>
                    <div className="font-bold text-gray-900 dark:text-white text-2xl">
                      £{parseFloat(jobData.price_total).toFixed(2)}
                    </div>
                  </div>
                )}

                {(!jobData.price_total || parseFloat(jobData.price_total) === 0) && (
                  <div className="pt-4 border-t-2 border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Repair Price</div>
                    <div className="font-semibold text-gray-600 dark:text-gray-400 text-lg">
                      To be confirmed after diagnosis
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

                {/* Terms & Conditions */}
                <div id="terms-section" className="pt-4 border-t-2 border-gray-200 dark:border-gray-700">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    Important Information
                  </h4>
                  
                  {/* Diagnostic Fee - Only for certain repair types */}
                  {(jobData.issue?.toLowerCase().includes('water') || 
                    jobData.issue?.toLowerCase().includes('no power') || 
                    jobData.issue?.toLowerCase().includes('not loading') ||
                    jobData.issue?.toLowerCase().includes('black screen')) && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-4">
                      <h5 className="font-bold text-yellow-900 dark:text-yellow-100 mb-2">
                        Diagnostic Fee: {diagnosticFee}
                      </h5>
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        In certain cases where diagnostics are required (such as water damage or when the device is not powered on), a diagnostic fee of {diagnosticFee} is applicable should you choose not to proceed with the repair. This fee is waived if you proceed with the repair.
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 italic">
                        Note: This does not apply to straightforward repairs like screen or battery replacements.
                      </p>
                    </div>
                  )}

                  {/* Terms Acceptance */}
                  <label className={`flex items-start space-x-3 cursor-pointer p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all ${
                    shakeTerms ? 'animate-shake ring-4 ring-red-400 ring-opacity-50 bg-red-50 dark:bg-red-900/20' : ''
                  }`}>
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 flex-shrink-0"
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      I understand and accept the diagnostic fee policy and terms & conditions
                    </span>
                  </label>
                  {shakeTerms && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-semibold animate-pulse">
                      Please accept the terms to continue
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CustomerConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <CustomerConfirmContent />
    </Suspense>
  )
}
