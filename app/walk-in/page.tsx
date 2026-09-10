'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Loader2, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'

const TOTAL_STEPS = 3 // 0: name, 1: phone, 2: device, 3: summary
const STORAGE_KEY = 'nfd-walk-in-progress'

// Map walk-in device types to catalogue categories
const DEVICE_TYPE_TO_CATEGORY: Record<string, string[]> = {
  phone: ['Phones'],
  tablet: ['Tablets'],
  laptop: ['Computers'],
  macbook: ['Computers'],
  console: ['Gaming & Controllers'],
  other: ['Other devices', 'Wearables'],
}

interface SavedProgress {
  step: number
  formData: typeof defaultFormData
  jobId: string | null
  jobRef: string | null
}

const defaultFormData = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  deviceType: 'phone' as string,
  deviceMake: '',
  deviceModel: '',
  issue: '',
  description: '',
  notSure: false,
  termsAccepted: false,
}

export default function WalkInSelfBookingPage() {
  const [loading, setLoading] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [jobRef, setJobRef] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [catalogue, setCatalogue] = useState<Record<string, Record<string, string[]>> | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const [formData, setFormData] = useState(defaultFormData)

  const issueOptions: Record<string, string[]> = {
    phone: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Data Recovery', 'Software Issues', 'Other'],
    tablet: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Software Issues', 'Other'],
    laptop: ['Screen Replacement', 'Keyboard Replacement', 'Battery Replacement', 'Charging Issues', 'Windows Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    macbook: ['Screen Replacement', 'Battery Replacement', 'Keyboard Replacement', 'Charging Issues', 'macOS Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    console: ['HDMI Port Replacement', 'Disc Drive Issues', 'Overheating', 'No Power', 'Software Issues', 'Controller Issues', 'Other'],
    other: ['Hardware Issue', 'Software Issue', 'Data Recovery', 'Other'],
  }

  // --- Restore from localStorage on mount ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: SavedProgress = JSON.parse(saved)
        // Only restore if the saved data has a name and phone (meaningful progress)
        if (parsed.formData?.customerName || parsed.formData?.customerPhone) {
          setFormData({ ...defaultFormData, ...parsed.formData })
          setCurrentStep(parsed.step || 0)
          setJobId(parsed.jobId || null)
          setJobRef(parsed.jobRef || '')
          setRestored(true)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // --- Fetch device catalogue on mount ---
  useEffect(() => {
    fetch('/api/public/device-catalogue')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setCatalogue(data.categories || null))
      .catch(() => setCatalogueError(true))
  }, [])

  // --- Auto-save to localStorage whenever form data or step changes ---
  useEffect(() => {
    // Only save if there's something to save
    if (!formData.customerName && !formData.customerPhone) return

    const progress: SavedProgress = {
      step: currentStep,
      formData,
      jobId,
      jobRef,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    } catch {
      // localStorage might be full or unavailable
    }
  }, [formData, currentStep, jobId, jobRef])

  // --- Clear localStorage on success ---
  const clearProgress = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  // Get available brands for the selected device type
  const getAvailableBrands = (): string[] => {
    if (!catalogue) return []
    const cats = DEVICE_TYPE_TO_CATEGORY[formData.deviceType] || []
    const brands = new Set<string>()
    for (const cat of cats) {
      if (catalogue[cat]) {
        for (const brand of Object.keys(catalogue[cat])) {
          if (formData.deviceType === 'laptop' && brand === 'Apple') continue
          if (formData.deviceType === 'macbook' && brand !== 'Apple') continue
          brands.add(brand)
        }
      }
    }
    return Array.from(brands).sort()
  }

  // Get available models for the selected brand
  const getAvailableModels = (): string[] => {
    if (!catalogue || !formData.deviceMake) return []
    const cats = DEVICE_TYPE_TO_CATEGORY[formData.deviceType] || []
    const models = new Set<string>()
    for (const cat of cats) {
      if (catalogue[cat] && catalogue[cat][formData.deviceMake]) {
        for (const model of catalogue[cat][formData.deviceMake]) {
          models.add(model)
        }
      }
    }
    return Array.from(models).sort()
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

  // --- Auto-create job when moving past the phone step ---
  const autoCreateJob = async () => {
    if (jobId) return // Already have a job
    if (!formData.customerName.trim() || !formData.customerPhone.trim()) return

    setAutoSaving(true)
    try {
      // First, check if there's an existing incomplete job for this phone
      const lookupRes = await fetch('/api/public/walk-in/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookup: true, phone: formData.customerPhone.trim() }),
      })
      const lookupData = await lookupRes.json()

      if (lookupData.found && lookupData.job) {
        // Restore from existing job
        setJobId(lookupData.job.id)
        setJobRef(lookupData.job.job_ref || '')
        // Pre-fill any missing fields from the existing job
        setFormData(prev => ({
          ...prev,
          customer_name: prev.customerName || lookupData.job.customer_name || '',
          customer_phone: prev.customerPhone || lookupData.job.customer_phone || '',
          customerEmail: prev.customerEmail || lookupData.job.customer_email || '',
          deviceType: prev.deviceType !== 'phone' ? prev.deviceType : (lookupData.job.device_type || 'phone'),
          deviceMake: prev.deviceMake || (lookupData.job.device_make && lookupData.job.device_make !== 'To be added' ? lookupData.job.device_make : ''),
          deviceModel: prev.deviceModel || (lookupData.job.device_model && lookupData.job.device_model !== 'To be added' ? lookupData.job.device_model : ''),
          issue: prev.issue || (lookupData.job.issue && lookupData.job.issue !== 'To be assessed' ? lookupData.job.issue : ''),
          description: prev.description || lookupData.job.description || '',
        }))
        setAutoSaving(false)
        return
      }

      // No existing job — create a new quick-intake job
      const createRes = await fetch('/api/public/walk-in/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formData.customerName.trim(),
          customer_phone: formData.customerPhone.trim(),
          customer_email: formData.customerEmail.trim() || null,
          device_type: formData.deviceType,
          device_make: formData.deviceMake || 'Unknown',
          device_model: formData.deviceModel || 'Unknown',
          issue: formData.issue || 'To be assessed',
          description: formData.description || null,
          terms_accepted: false,
        }),
      })
      const createData = await createRes.json()

      if (createData.success) {
        setJobId(createData.job_id)
        setJobRef(createData.job_ref || '')
      }
    } catch (err) {
      console.error('Auto-create job error:', err)
      // Don't block the user — they can still continue and submit later
    } finally {
      setAutoSaving(false)
    }
  }

  const goNext = () => {
    const errors: Record<string, string> = {}
    if (currentStep === 0 && !formData.customerName.trim()) {
      errors.customerName = 'Please enter your name'
    }
    if (currentStep === 1 && !formData.customerPhone.trim()) {
      errors.customerPhone = 'Please enter your mobile number'
    }
    if (currentStep === 2 && !formData.notSure) {
      if (!formData.deviceMake.trim()) errors.deviceMake = 'Please enter the device make or choose "Not sure"'
      if (!formData.deviceModel.trim()) errors.deviceModel = 'Please enter the device model or choose "Not sure"'
      if (!formData.issue.trim()) errors.issue = 'Please select the main problem or choose "Not sure"'
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors({})

    // Auto-create job when moving from step 1 (phone) to step 2 (device)
    if (currentStep === 1 && !jobId) {
      autoCreateJob()
    }

    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setValidationErrors({})
    setCurrentStep(prev => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.termsAccepted) {
      setValidationErrors({ termsAccepted: 'Please accept the repair terms and diagnostic fee policy' })
      setError('Please accept the agreement before checking in')
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
        device_make: formData.notSure ? 'To be assessed' : (formData.deviceMake.trim() || 'Unknown'),
        device_model: formData.notSure ? 'To be assessed' : (formData.deviceModel.trim() || 'Unknown'),
        issue: formData.notSure ? 'To be assessed' : (formData.issue.trim() || 'To be assessed'),
        description: formData.description.trim() || null,
        terms_accepted: true,
        job_id: jobId, // Include if we already created a job
      }

      const response = await fetch('/api/public/walk-in/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setJobRef(result.job_ref)
        setSuccess(true)
        clearProgress()
      } else {
        setError(result.error || 'Failed to create booking')
      }
    } catch (err) {
      console.error('Walk-in booking error:', err)
      setError('Something went wrong. Please try again or ask staff for help.')
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
            Your device is now booked in with us.
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
              <li>1. We&apos;ll assess your device and text you a quote</li>
              <li>2. Track your repair via SMS updates</li>
              <li>3. We&apos;ll text you when it&apos;s ready to collect</li>
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
              Check In Your Device
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Fill in your details below — your progress is saved automatically
            </p>
          </div>

          {restored && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-center text-sm text-blue-700 dark:text-blue-300">
              Welcome back! We&apos;ve saved your progress from last time.
            </div>
          )}

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

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
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
                    <p className="p-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
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
                      <p className="p-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
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
                        {catalogue && getAvailableBrands().length > 0 ? (
                          <select
                            name="deviceMake"
                            value={formData.deviceMake}
                            onChange={handleChange}
                            className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">Select a brand...</option>
                            {getAvailableBrands().map(brand => (
                              <option key={brand} value={brand}>{brand}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            name="deviceMake"
                            value={formData.deviceMake}
                            onChange={handleChange}
                            className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g., Apple, Samsung, HP"
                          />
                        )}
                        {catalogueError && (
                          <p className="mt-1 text-xs text-gray-400">Could not load brand list — type it in instead.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Device Model
                        </label>
                        {catalogue && formData.deviceMake && getAvailableModels().length > 0 ? (
                          <select
                            name="deviceModel"
                            value={formData.deviceModel}
                            onChange={handleChange}
                            className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">Select a model...</option>
                            {getAvailableModels().map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            name="deviceModel"
                            value={formData.deviceModel}
                            onChange={handleChange}
                            className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g., iPhone 14 Pro, Galaxy S23"
                          />
                        )}
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
                    Your device is booked in with us.
                  </p>
                  <label className={`mt-5 flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${validationErrors.termsAccepted ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'}`}>
                    <input type="checkbox" name="termsAccepted" checked={formData.termsAccepted} onChange={handleChange} className="h-6 w-6 mt-0.5 rounded text-primary" />
                    <span className="text-sm text-gray-900 dark:text-white">
                      <strong>I accept the repair terms and diagnostic fee policy</strong>
                      <span className="block text-xs text-gray-600 dark:text-gray-400 mt-1">Diagnostic fees may apply where investigation is required: £20 for small devices or £40 for laptops, desktops and consoles.</span>
                    </span>
                  </label>
                  {validationErrors.termsAccepted && <p className="mt-2 text-sm font-semibold text-red-600">{validationErrors.termsAccepted}</p>}
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
                  disabled={autoSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-colors active:scale-95 text-lg disabled:opacity-50"
                >
                  {autoSaving ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
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
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-6 w-6" />
                      Submit
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
