'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, Lock, Unlock, AlertCircle, Smartphone, ChevronDown } from 'lucide-react'

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
  const [repairAgreementAccepted, setRepairAgreementAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [shakeTerms, setShakeTerms] = useState(false)
  const [isLandline, setIsLandline] = useState(false)
  const [landlineAccepted, setLandlineAccepted] = useState(false)
  const [isForeignNumber, setIsForeignNumber] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Get job data from URL params
  const jobId = searchParams.get('jobId') // For completing onboarding on existing job
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

  const passcodeRequired = jobData.passcode_requirement !== 'not_required'
  const totalSteps = passcodeRequired ? 5 : 4 // name, phone, email, [passcode], summary
  const summaryStep = passcodeRequired ? 4 : 3

  // Load saved wizard state from sessionStorage (survives back navigation)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWizard = sessionStorage.getItem('customer_confirm_wizard')
      if (savedWizard) {
        try {
          const saved = JSON.parse(savedWizard)
          if (saved.customerName) setCustomerName(saved.customerName)
          if (saved.customerPhone) setCustomerPhone(saved.customerPhone)
          if (saved.customerEmail) setCustomerEmail(saved.customerEmail)
          if (saved.devicePassword) setDevicePassword(saved.devicePassword)
          if (saved.passcodeMethod) setPasscodeMethod(saved.passcodeMethod)
          if (saved.currentStep !== undefined) setCurrentStep(saved.currentStep)
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Also check for quote customer data (takes priority for pre-filling)
      const quoteCustomerData = sessionStorage.getItem('quote_customer_data')
      if (quoteCustomerData) {
        try {
          const data = JSON.parse(quoteCustomerData)
          setCustomerName(data.customer_name || '')
          setCustomerPhone(data.customer_phone || '')
          setCustomerEmail(data.customer_email || '')
          sessionStorage.removeItem('quote_customer_data')
          if (data.customer_name && data.customer_phone) {
            setCurrentStep(summaryStep)
          }
        } catch (error) {
          console.error('Failed to load quote customer data:', error)
        }
      }
    }
  }, [])

  // Save wizard state to sessionStorage whenever fields change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('customer_confirm_wizard', JSON.stringify({
        customerName,
        customerPhone,
        customerEmail,
        devicePassword,
        passcodeMethod,
        currentStep,
      }))
    }
  }, [customerName, customerPhone, customerEmail, devicePassword, passcodeMethod, currentStep])

  const isSmallDevice = ['phone', 'tablet', 'watch'].includes(jobData.device_type)
  const diagnosticFee = isSmallDevice ? '£20' : '£40'

  // Wizard navigation
  const goNext = () => {
    // Validate current step before proceeding
    if (currentStep === 0 && !customerName.trim()) {
      setValidationErrors({ customerName: 'Please enter your full name' })
      setShowValidationSummary(true)
      return
    }
    if (currentStep === 1) {
      if (!customerPhone.trim()) {
        setValidationErrors({ customerPhone: 'Please enter your mobile phone number' })
        setShowValidationSummary(true)
        return
      }
      if (isLandline && !landlineAccepted) {
        setValidationErrors({ landline: 'Please accept the landline charge or use a mobile number' })
        setShowValidationSummary(true)
        return
      }
    }
    if (currentStep === 2 && isForeignNumber && !customerEmail.trim()) {
      setValidationErrors({ customerEmail: 'Foreign phone numbers need an email for updates' })
      setShowValidationSummary(true)
      return
    }

    setValidationErrors({})
    setShowValidationSummary(false)
    setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setValidationErrors({})
    setShowValidationSummary(false)
    setCurrentStep(prev => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    const errors: Record<string, string> = {}

    if (!customerName.trim()) {
      errors.customerName = 'Please enter your full name'
    }

    if (!customerPhone.trim()) {
      errors.customerPhone = 'Please enter your mobile phone number'
    } else {
      // Validate UK phone number format
      const cleanPhone = customerPhone.replace(/[\s\-()]/g, '')
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

    if (isForeignNumber && !customerEmail.trim()) {
      errors.customerEmail = 'Foreign phone numbers cannot receive SMS. Please provide an email address for updates.'
    }

    if (isLandline && !landlineAccepted) {
      errors.landline = 'Please accept the additional charge for using a landline number, or provide a mobile number instead'
    }

    if (!repairAgreementAccepted) {
      errors.repairAgreement = 'Please accept the repair agreement to continue'
    }

    // If there are validation errors, show them and prevent submission
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setShowValidationSummary(true)
      
      // Trigger shake + scroll to terms if terms not accepted
      if (errors.repairAgreement) {
        setShakeTerms(true)
        setTimeout(() => setShakeTerms(false), 600)
        const termsEl = document.getElementById('terms-section')
        if (termsEl) {
          termsEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
      
      // Scroll to the first error field
      const firstErrorField = Object.keys(errors)[0]
      const errorElement = document.querySelector(`[data-field="${firstErrorField}"]`) || document.getElementById('terms-section')
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      
      // Hide validation summary after 10 seconds
      setTimeout(() => {
        setShowValidationSummary(false)
      }, 10000)
      
      return
    }
    
    // Clear any previous validation errors
    setValidationErrors({})
    setShowValidationSummary(false)

    setLoading(true)

    try {
      // Get override options from sessionStorage (from advanced options on create page)
      let overrideOptions = null
      if (typeof window !== 'undefined') {
        const storedOverrides = sessionStorage.getItem('job_creation_overrides')
        if (storedOverrides) {
          overrideOptions = JSON.parse(storedOverrides)
          // Clear after reading
          sessionStorage.removeItem('job_creation_overrides')
        }
      }

      // Ensure price_total is a valid number
      const priceValue = parseFloat(jobData.price_total)
      const finalPrice = isNaN(priceValue) ? 0 : priceValue

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        device_type: jobData.device_type || null,
        device_make: jobData.device_make || 'Unknown',
        device_model: jobData.device_model || 'Unknown',
        issue: jobData.issue || 'Repair needed',
        description: jobData.description || null,
        price_total: finalPrice,
        quoted_price: finalPrice,
        requires_parts_order: jobData.requires_parts_order,
        source: 'staff_manual',
        device_password: (passwordNA || passcodeMethod !== 'provided') ? null : devicePassword.trim(),
        password_not_applicable: passwordNA || passcodeMethod === 'not_applicable',
        passcode_requirement: jobData.passcode_requirement,
        passcode_method: passcodeMethod,
        customer_signature: null,
        terms_accepted: true,
        onboarding_completed: true,
        device_in_shop: jobData.device_left_with_us,
        linked_quote_id: jobData.linked_quote_id,
        // Advanced overrides for importing old jobs
        initial_status: overrideOptions?.initial_status || null,
        skip_sms: overrideOptions?.skip_initial_sms || false,
      }

      console.log('🔍 Submitting job with payload:', payload)
      console.log('🔍 Required fields check:', {
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        price_total: payload.price_total,
        types: {
          customer_name: typeof payload.customer_name,
          customer_phone: typeof payload.customer_phone,
          price_total: typeof payload.price_total,
        }
      })

      // If jobId is present, update existing job instead of creating new one
      if (jobId) {
        // Update existing job with onboarding data
        const { createClient } = await import('@/lib/supabase-browser')
        const supabase = createClient()
        
        const { error: updateError } = await supabase
          .from('jobs')
          .update({
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            customer_email: payload.customer_email,
            device_password: payload.device_password,
            password_not_applicable: payload.password_not_applicable,
            passcode_method: payload.passcode_method,
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
            device_in_shop: true,
            status: 'RECEIVED', // Update status to RECEIVED now that device is in shop
          } as any)
          .eq('id', jobId)

        if (updateError) {
          alert(`Failed to complete onboarding: ${updateError.message}`)
          setLoading(false)
          return
        }

        // Log event
        await supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: 'Onboarding completed in-shop by staff',
        } as any)

        // Clear wizard state so next job starts fresh
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('customer_confirm_wizard')
        }
        // Redirect back to job detail page
        router.push(`/app/jobs/${jobId}`)
        return
      }

      // Otherwise create new job
      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      console.log('🔍 API Response:', result)

      if (response.ok) {
        // Clear form state so next job starts fresh
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('job_create_form_state')
          sessionStorage.removeItem('quote_customer_data')
          sessionStorage.removeItem('job_creation_overrides')
          sessionStorage.removeItem('customer_confirm_wizard')
        }
        // Show success and redirect
        // API returns job_ref directly, not nested in result.job
        router.push(`/app/jobs/create/success?job_ref=${result.job_ref}${customerEmail ? '&email=' + encodeURIComponent(customerEmail) : ''}`)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-4 max-w-4xl">

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'bg-primary w-12'
                  : i < currentStep
                    ? 'bg-primary w-6'
                    : 'bg-gray-300 dark:bg-gray-600 w-6'
              }`}
            />
          ))}
        </div>

        {/* Mobile device banner — compact, only on small screens */}
        <div className="md:hidden bg-white dark:bg-gray-800 rounded-xl shadow p-3 mb-4 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
              {jobData.device_make} {jobData.device_model}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{jobData.issue}</p>
          </div>
          {jobData.price_total && parseFloat(jobData.price_total) > 0 && (
            <p className="font-bold text-primary text-base flex-shrink-0">£{parseFloat(jobData.price_total).toFixed(2)}</p>
          )}
        </div>

        <div className="relative md:pr-[19rem]">
          {/* Main wizard column */}
          <div className="max-w-2xl mx-auto w-full">

        {/* Step 0: Full Name */}
        {currentStep === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              What's your full name?
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              We need this for your repair booking
            </p>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                if (validationErrors.customerName) {
                  setValidationErrors({})
                  setShowValidationSummary(false)
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') goNext() }}
              className={`w-full px-4 py-4 text-xl border-2 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                validationErrors.customerName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
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
            <button
              onClick={goNext}
              className="w-full mt-6 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl text-lg transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              Next
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Step 1: Phone Number */}
        {currentStep === 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              What's your mobile number?
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              We'll text you updates about your repair
            </p>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => {
                const phone = e.target.value
                setCustomerPhone(phone)
                setPhoneError('')
                setValidationErrors({})
                setShowValidationSummary(false)
                const cleanPhone = phone.replace(/[\s\-()]/g, '')
                if (cleanPhone.length > 0) {
                  let isUKNumber = false
                  if (cleanPhone.startsWith('+44') || cleanPhone.startsWith('0044')) isUKNumber = true
                  else if (cleanPhone.startsWith('44') && cleanPhone.length >= 12) isUKNumber = true
                  else if (cleanPhone.startsWith('0') && !cleanPhone.startsWith('00')) isUKNumber = true
                  if (!isUKNumber && (cleanPhone.startsWith('+') || cleanPhone.startsWith('00'))) {
                    setIsForeignNumber(true); setIsLandline(false); setLandlineAccepted(false)
                  } else if (isUKNumber) {
                    setIsForeignNumber(false)
                    let normalizedPhone = cleanPhone
                    if (cleanPhone.startsWith('+44')) normalizedPhone = '0' + cleanPhone.substring(3)
                    else if (cleanPhone.startsWith('0044')) normalizedPhone = '0' + cleanPhone.substring(4)
                    else if (cleanPhone.startsWith('44') && cleanPhone.length >= 12) normalizedPhone = '0' + cleanPhone.substring(2)
                    const isLandlineNumber = /^0[123]/.test(normalizedPhone)
                    setIsLandline(isLandlineNumber)
                    if (!isLandlineNumber) setLandlineAccepted(false)
                    if (normalizedPhone.length > 0 && normalizedPhone.length !== 11) setPhoneError('UK phone numbers must be 11 digits')
                  }
                } else {
                  setIsForeignNumber(false); setIsLandline(false); setLandlineAccepted(false)
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') goNext() }}
              className={`w-full px-4 py-4 text-xl border-2 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                validationErrors.customerPhone ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
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
            {phoneError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{phoneError}</p>}
            {isForeignNumber && (
              <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
                <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold mb-1">Foreign Number Detected</p>
                <p className="text-xs text-orange-800 dark:text-orange-200">We can only send SMS to UK numbers. You'll need to provide an email on the next step.</p>
              </div>
            )}
            {isLandline && (
              <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
                <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold mb-1">Landline Number Detected</p>
                <p className="text-xs text-orange-800 dark:text-orange-200 mb-3">Landline numbers require manual phone calls which take more time.</p>
                <label className="flex items-start space-x-3 cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <input type="checkbox" checked={landlineAccepted} onChange={(e) => setLandlineAccepted(e.target.checked)} className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 flex-shrink-0" />
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">I understand there is an additional £20 charge for using a landline number.</span>
                </label>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={goBack} className="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-lg active:scale-95 transition-all">Back</button>
              <button onClick={goNext} className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl text-lg transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2">Next <ChevronDown className="h-5 w-5" /></button>
            </div>
          </div>
        )}

        {/* Step 2: Email */}
        {currentStep === 2 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {isForeignNumber ? "Email address" : "Email (optional)"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {isForeignNumber ? "Required — we can't SMS your foreign number" : "Get repair updates by email"}
            </p>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => { setCustomerEmail(e.target.value); if (validationErrors.customerEmail) { setValidationErrors({}); setShowValidationSummary(false) } }}
              onKeyDown={(e) => { if (e.key === 'Enter') goNext() }}
              className={`w-full px-4 py-4 text-xl border-2 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${validationErrors.customerEmail ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary'}`}
              placeholder="your@email.com"
              autoFocus
            />
            {validationErrors.customerEmail && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{validationErrors.customerEmail}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={goBack} className="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-lg active:scale-95 transition-all">Back</button>
              {!isForeignNumber && <button onClick={() => { setCustomerEmail(''); goNext() }} className="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-lg active:scale-95 transition-all">Skip</button>}
              <button onClick={goNext} className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl text-lg transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2">Next <ChevronDown className="h-5 w-5" /></button>
            </div>
          </div>
        )}

        {/* Step 3: Passcode */}
        {currentStep === 3 && passcodeRequired && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Device Passcode</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">We need this to test your device after repair</p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-800 dark:text-blue-200">Stored securely, deleted 7 days after repair.</p>
            </div>
            <div className="space-y-3">
              <label className={`flex items-start space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${passcodeMethod === 'provided' ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <input type="radio" name="passcode_method" value="provided" checked={passcodeMethod === 'provided'} onChange={(e) => { setPasscodeMethod(e.target.value); setPasswordNA(false) }} className="w-5 h-5 text-primary focus:ring-primary mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Lock className="h-5 w-5" /> Provide passcode now</div>
                  {passcodeMethod === 'provided' && (
                    <div className="mt-3 relative">
                      <input type={showPassword ? "text" : "password"} value={devicePassword} onChange={(e) => setDevicePassword(e.target.value)} className="w-full px-4 py-3 pr-12 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-mono" placeholder="Enter passcode" autoFocus />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400">{showPassword ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</button>
                    </div>
                  )}
                </div>
              </label>
              <label className={`flex items-start space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${passcodeMethod === 'send_link' ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <input type="radio" name="passcode_method" value="send_link" checked={passcodeMethod === 'send_link'} onChange={(e) => { setPasscodeMethod(e.target.value); setPasswordNA(false) }} className="w-5 h-5 text-primary focus:ring-primary mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Send me a link later</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">We will text a secure link to enter it</div>
                </div>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={goBack} className="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-lg active:scale-95 transition-all">Back</button>
              <button onClick={goNext} className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl text-lg transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2">Next <ChevronDown className="h-5 w-5" /></button>
            </div>
          </div>
        )}

        {/* Final Step: Summary + Terms + Confirm */}
        {currentStep === summaryStep && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Your Details</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Tap any field to edit</p>
            <div className="space-y-3 mb-6">
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Full name" />

              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Mobile phone" />

              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Email (optional)" />
              {passcodeRequired && (
                <div className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-gray-900 dark:text-white">
                      {passcodeMethod === 'send_link' ? 'Passcode: link to be sent' : devicePassword ? 'Passcode: provided' : 'Passcode: not set'}
                    </span>
                    <button onClick={() => setEditingField(editingField === 'passcode' ? null : 'passcode')} className="text-sm text-primary font-semibold">
                      {editingField === 'passcode' ? 'Done' : 'Change'}
                    </button>
                  </div>
                  {editingField === 'passcode' && (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="passcode_summary" checked={passcodeMethod === 'provided'} onChange={() => { setPasscodeMethod('provided'); setPasswordNA(false) }} className="w-4 h-4 text-primary" />
                        <span>Provide now</span>
                      </label>
                      {passcodeMethod === 'provided' && (
                        <input type={showPassword ? "text" : "password"} value={devicePassword} onChange={(e) => setDevicePassword(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono" placeholder="Enter passcode" autoFocus />
                      )}
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="passcode_summary" checked={passcodeMethod === 'send_link'} onChange={() => { setPasscodeMethod('send_link'); setPasswordNA(false) }} className="w-4 h-4 text-primary" />
                        <span>Send link later</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
              {jobData.requires_parts_order && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-sm text-yellow-900 dark:text-yellow-100">£20 deposit needed for parts order</div>
              )}
            </div>

            {(jobData.issue?.toLowerCase().includes('water') || jobData.issue?.toLowerCase().includes('no power') || jobData.issue?.toLowerCase().includes('not loading') || jobData.issue?.toLowerCase().includes('black screen')) && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-4">
                <h5 className="font-bold text-yellow-900 dark:text-yellow-100 mb-1 text-sm">Diagnostic Fee: {diagnosticFee}</h5>
                <p className="text-xs text-yellow-800 dark:text-yellow-200">Waived if you proceed with the repair.</p>
              </div>
            )}

                        <div id="terms-section" onClick={() => { setRepairAgreementAccepted(!repairAgreementAccepted); setTermsAccepted(!repairAgreementAccepted); setShakeTerms(false) }} className={`border-2 rounded-xl p-4 mb-4 transition-all cursor-pointer ${repairAgreementAccepted ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' : shakeTerms ? 'border-red-400 bg-red-50 dark:bg-red-900/20 animate-shake' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={repairAgreementAccepted} onChange={(e) => { setRepairAgreementAccepted(e.target.checked); setTermsAccepted(e.target.checked); setShakeTerms(false) }} onClick={(e) => e.stopPropagation()} className={`w-6 h-6 text-primary focus:ring-primary border-2 rounded mt-0.5 flex-shrink-0 ${shakeTerms ? 'border-red-500 animate-pulse' : 'border-gray-300'}`} />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  I agree to the repair terms and conditions
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-9 leading-relaxed">
                Diagnostic fees may apply. Back up your data. Storage fees for uncollected devices.{' '}
                <a href="https://www.newforestdevicerepairs.co.uk/terms-and-conditions/" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary underline">View full terms</a>
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={goBack} className="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-lg active:scale-95 transition-all">Back</button>
              <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-95 text-white font-bold py-4 px-6 rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2 min-h-[56px]">
                {loading ? (<><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> Creating Booking...</>) : (<><CheckCircle className="h-6 w-6" /> Confirm Booking</>)}
              </button>
            </div>
          </div>
        )}

          </div>

          {/* Device info sidebar — absolutely positioned to match main card height exactly */}
          <div className="hidden md:block absolute top-0 right-0 bottom-0 w-72">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 h-full flex flex-col overflow-hidden">
              {/* Icon + device */}
              <div className="flex flex-col items-center text-center mb-3">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0 mb-2">
                  <Smartphone className="h-8 w-8 text-primary" />
                </div>
                <p className="font-bold text-base text-gray-900 dark:text-white leading-tight">
                  {jobData.device_make} {jobData.device_model}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{jobData.issue}</p>
              </div>

              {/* Price */}
              {jobData.price_total && parseFloat(jobData.price_total) > 0 && (
                <div className="text-center mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Price</p>
                  <p className="text-2xl font-black text-primary">£{parseFloat(jobData.price_total).toFixed(2)}</p>
                </div>
              )}

              {/* Customer info — fills progressively, scrolls if needed */}
              <div className="flex-1 overflow-y-auto space-y-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Your Details</p>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${customerName ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                    <CheckCircle className={`h-4 w-4 flex-shrink-0 ${customerName ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
                    <span className="truncate">{customerName || 'Name'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${customerPhone ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                    <CheckCircle className={`h-4 w-4 flex-shrink-0 ${customerPhone ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
                    <span className="truncate">{customerPhone || 'Phone'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${customerEmail ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                    <CheckCircle className={`h-4 w-4 flex-shrink-0 ${customerEmail ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
                    <span className="truncate">{customerEmail || 'Email (optional)'}</span>
                  </div>
                  {passcodeRequired && (
                    <div className={`flex items-center gap-2 text-sm ${devicePassword || passcodeMethod === 'send_link' ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                      <CheckCircle className={`h-4 w-4 flex-shrink-0 ${devicePassword || passcodeMethod === 'send_link' ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
                      <span className="truncate">{devicePassword ? 'Passcode set' : passcodeMethod === 'send_link' ? 'Link to be sent' : 'Passcode'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Deposit info at bottom */}
              {jobData.requires_parts_order && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2 text-xs text-yellow-900 dark:text-yellow-100 mt-3">
                  £20 deposit needed for parts
                </div>
              )}
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
