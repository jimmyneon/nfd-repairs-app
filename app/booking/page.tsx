'use client'

import { useState } from 'react'
import { Smartphone, CheckCircle, Loader2, AlertCircle, Lock, Unlock } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CustomerBookingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)
  const [shakeTerms, setShakeTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLandline, setIsLandline] = useState(false)
  const [landlineAccepted, setLandlineAccepted] = useState(false)
  const [isForeignNumber, setIsForeignNumber] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    deviceType: 'phone' as 'phone' | 'tablet' | 'laptop' | 'macbook' | 'console' | 'other',
    deviceMake: '',
    deviceModel: '',
    issue: '',
    description: '',
    notSure: false,
  })

  const issueOptions = {
    phone: [
      'Screen Replacement',
      'Battery Replacement',
      'Charging Port Replacement',
      'Not Charging',
      'Water Damage',
      'No Power',
      'Black Screen',
      'Data Recovery',
      'Software Issues',
      'Other',
    ],
    tablet: [
      'Screen Replacement',
      'Battery Replacement',
      'Charging Port Replacement',
      'Not Charging',
      'Water Damage',
      'No Power',
      'Black Screen',
      'Software Issues',
      'Other',
    ],
    laptop: [
      'Screen Replacement',
      'Keyboard Replacement',
      'Battery Replacement',
      'Charging Issues',
      'Windows Reinstall',
      'Software Issues',
      'Hardware Diagnostics',
      'Data Recovery',
      'Other',
    ],
    macbook: [
      'Screen Replacement',
      'Battery Replacement',
      'Keyboard Replacement',
      'Charging Issues',
      'macOS Reinstall',
      'Software Issues',
      'Hardware Diagnostics',
      'Data Recovery',
      'Other',
    ],
    console: [
      'HDMI Port Replacement',
      'Disc Drive Issues',
      'Overheating',
      'No Power',
      'Software Issues',
      'Controller Issues',
      'Other',
    ],
    other: [
      'Hardware Issue',
      'Software Issue',
      'Data Recovery',
      'Other',
    ],
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
      if (Object.keys(validationErrors).length === 1) {
        setShowValidationSummary(false)
      }
    }

    if (name === 'customerPhone') {
      setPhoneError('')
      const cleanPhone = value.replace(/[\s\-()]/g, '')
      
      if (cleanPhone.length > 0) {
        let isUKNumber = false
        
        if (cleanPhone.startsWith('+44') || cleanPhone.startsWith('0044')) {
          isUKNumber = true
        } else if (cleanPhone.startsWith('44') && cleanPhone.length >= 12) {
          isUKNumber = true
        } else if (cleanPhone.startsWith('0') && !cleanPhone.startsWith('00')) {
          isUKNumber = true
        } else if (cleanPhone.startsWith('+') || cleanPhone.startsWith('00')) {
          isUKNumber = false
        }
        
        if (!isUKNumber) {
          setIsForeignNumber(true)
          setIsLandline(false)
          setLandlineAccepted(false)
        } else {
          setIsForeignNumber(false)
          
          let normalizedPhone = cleanPhone
          if (cleanPhone.startsWith('+44')) {
            normalizedPhone = '0' + cleanPhone.substring(3)
          } else if (cleanPhone.startsWith('0044')) {
            normalizedPhone = '0' + cleanPhone.substring(4)
          } else if (cleanPhone.startsWith('44') && cleanPhone.length >= 12) {
            normalizedPhone = '0' + cleanPhone.substring(2)
          }
          
          const isLandlineNumber = /^0[123]/.test(normalizedPhone)
          setIsLandline(isLandlineNumber)
          
          if (!isLandlineNumber) {
            setLandlineAccepted(false)
          }
          
          if (normalizedPhone.length > 0 && normalizedPhone.length !== 11) {
            setPhoneError('UK phone numbers must be 11 digits')
          }
        }
      } else {
        setIsForeignNumber(false)
        setIsLandline(false)
        setLandlineAccepted(false)
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}

    if (!formData.customerName.trim()) {
      errors.customerName = 'Your name is required'
    }

    if (!formData.customerPhone.trim()) {
      errors.customerPhone = 'Your phone number is required'
    } else {
      const cleanPhone = formData.customerPhone.replace(/[\s\-()]/g, '')
      const isUKNumber = /^(0|\+44|44)/.test(cleanPhone)
      
      if (isUKNumber) {
        let normalizedPhone = cleanPhone
        if (cleanPhone.startsWith('+44')) {
          normalizedPhone = '0' + cleanPhone.substring(3)
        } else if (cleanPhone.startsWith('44')) {
          normalizedPhone = '0' + cleanPhone.substring(2)
        }
        
        if (normalizedPhone.length !== 11) {
          errors.customerPhone = 'Please enter a valid UK phone number (11 digits)'
        }
      }
    }

    if (isForeignNumber && !formData.customerEmail.trim()) {
      errors.customerEmail = 'Email is required for foreign phone numbers'
    }

    if (isLandline && !landlineAccepted) {
      errors.customerPhone = 'Please accept the landline charge or provide a mobile number'
    }

    if (!formData.deviceMake.trim()) {
      errors.deviceMake = 'Device make is required'
    }

    if (!formData.deviceModel.trim()) {
      errors.deviceModel = 'Device model is required'
    }

    if (!formData.notSure && !formData.issue.trim()) {
      errors.issue = 'Please select an issue or check "Not sure what the problem is"'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setShowValidationSummary(true)
      
      const firstErrorField = Object.keys(errors)[0]
      const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          (errorElement as HTMLElement).focus()
        }, 500)
      }
      
      setTimeout(() => {
        setShowValidationSummary(false)
      }, 10000)
      
      return
    }

    setValidationErrors({})
    setShowValidationSummary(false)
    setLoading(true)

    try {
      const payload = {
        customer_name: formData.customerName.trim(),
        customer_phone: formData.customerPhone.trim(),
        customer_email: formData.customerEmail.trim() || null,
        device_make: formData.deviceMake.trim(),
        device_model: formData.deviceModel.trim(),
        device_type: formData.deviceType,
        issue: formData.notSure ? 'To be assessed' : formData.issue.trim(),
        description: formData.description.trim() || null,
        price_total: 0,
        quoted_price: 0,
        requires_parts_order: false,
        source: 'customer_online',
        device_password: null,
        password_not_applicable: true,
        passcode_requirement: 'not_required',
        passcode_method: 'not_applicable',
        customer_signature: null,
        terms_accepted: true,
        onboarding_completed: false,
        device_in_shop: false,
        linked_quote_id: null,
        skip_sms: false,
        initial_status: 'QUOTE_REQUESTED',
      }

      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        router.push(`/booking/success?job_ref=${result.job_ref}`)
      } else {
        alert(`Failed to create booking: ${result.error}`)
        setLoading(false)
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      alert('Failed to create booking. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Book Your Repair
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Fill in the details below and we'll get back to you with a quote
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
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
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="07410 123 456"
                  />
                  {phoneError && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">{phoneError}</p>
                  )}
                  {validationErrors.customerPhone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerPhone}
                    </p>
                  )}
                  {isForeignNumber && (
                    <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
                      <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold mb-2">
                        Foreign Number Detected
                      </p>
                      <p className="text-xs text-orange-800 dark:text-orange-200">
                        We only send SMS updates to UK numbers. Please provide an email address to receive repair updates.
                      </p>
                    </div>
                  )}
                  {isLandline && (
                    <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
                      <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold mb-2">
                        Landline Number Detected
                      </p>
                      <p className="text-xs text-orange-800 dark:text-orange-200 mb-3">
                        Our system automatically sends SMS notifications. Landline numbers require manual phone calls, which takes significantly more time.
                      </p>
                      <label className="flex items-start space-x-3 cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={landlineAccepted}
                          onChange={(e) => setLandlineAccepted(e.target.checked)}
                          className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 flex-shrink-0"
                        />
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          I understand there is an additional £20 charge for using a landline number.
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email {isForeignNumber && '*'}{!isForeignNumber && '(Optional)'}
                  </label>
                  <input
                    type="email"
                    name="customerEmail"
                    value={formData.customerEmail}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.customerEmail
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="your@email.com"
                  />
                  {validationErrors.customerEmail && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerEmail}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Information</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Device Type *
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
                    Device Make *
                  </label>
                  <input
                    type="text"
                    name="deviceMake"
                    value={formData.deviceMake}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.deviceMake
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="e.g., Apple, Samsung, HP"
                  />
                  {validationErrors.deviceMake && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.deviceMake}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Device Model *
                  </label>
                  <input
                    type="text"
                    name="deviceModel"
                    value={formData.deviceModel}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.deviceModel
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                    }`}
                    placeholder="e.g., iPhone 14 Pro, Galaxy S23"
                  />
                  {validationErrors.deviceModel && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.deviceModel}
                    </p>
                  )}
                </div>

                <div>
                  <label className="flex items-center space-x-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      name="notSure"
                      checked={formData.notSure}
                      onChange={handleChange}
                      className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      I'm not sure what the problem is
                    </span>
                  </label>
                </div>

                {!formData.notSure && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      What's the issue? *
                    </label>
                    <select
                      name="issue"
                      value={formData.issue}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                        validationErrors.issue
                          ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-transparent'
                      }`}
                    >
                      <option value="">Select an issue...</option>
                      {issueOptions[formData.deviceType].map(issue => (
                        <option key={issue} value={issue}>{issue}</option>
                      ))}
                    </select>
                    {validationErrors.issue && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {validationErrors.issue}
                      </p>
                    )}
                  </div>
                )}

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
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Passcode (Optional)</h2>
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
                    name="passcodeMethod"
                    value="provided"
                    checked={formData.passcodeMethod === 'provided'}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        passcodeMethod: e.target.value as any,
                        passwordNA: false
                      }))
                    }}
                    className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Provide passcode now
                    </div>
                    {formData.passcodeMethod === 'provided' && (
                      <div className="mt-3 relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          name="devicePassword"
                          value={formData.devicePassword}
                          onChange={handleChange}
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
                    name="passcodeMethod"
                    value="send_link"
                    checked={formData.passcodeMethod === 'send_link'}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        passcodeMethod: e.target.value as any,
                        passwordNA: false
                      }))
                    }}
                    className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">I'll provide it later</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">We'll send you a secure link to enter your passcode when convenient</div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcodeMethod"
                    value="not_applicable"
                    checked={formData.passcodeMethod === 'not_applicable'}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        passcodeMethod: e.target.value as any,
                        passwordNA: true
                      }))
                    }}
                    className="w-5 h-5 text-primary focus:ring-primary mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">No passcode needed</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">My device doesn't have a passcode</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                <h5 className="font-bold text-blue-900 dark:text-blue-100 mb-2 text-sm">
                  Terms & Conditions
                </h5>
                <p className="text-xs text-blue-900 dark:text-blue-100 mb-3 leading-relaxed">
                  Diagnostic work may incur a minimum charge. Additional issues will be discussed before work proceeds. Back up important data. Devices without passcodes receive limited testing. Parts may affect warranty. Storage fees apply for uncollected devices.
                </p>
                
                <label className={`flex items-start space-x-3 cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition-all ${
                  shakeTerms && !formData.termsAccepted ? 'animate-shake ring-4 ring-red-400 ring-opacity-50 bg-red-50 dark:bg-red-900/20' : ''
                }`}>
                  <input
                    type="checkbox"
                    name="termsAccepted"
                    checked={formData.termsAccepted}
                    onChange={handleChange}
                    className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 flex-shrink-0"
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    I agree to the repair terms and conditions
                  </span>
                </label>
                {validationErrors.termsAccepted && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.termsAccepted}
                  </p>
                )}
                
                <div className="text-xs text-blue-800 dark:text-blue-200 mt-3">
                  <a 
                    href="https://www.newforestdevicerepairs.co.uk/terms-and-conditions/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    View full terms and conditions
                  </a>
                </div>
              </div>
            </div>

            {showValidationSummary && Object.keys(validationErrors).length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-700 rounded-xl p-4 animate-shake">
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
                  Submitting Booking...
                </>
              ) : (
                <>
                  <CheckCircle className="h-6 w-6" />
                  Submit Booking Request
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
