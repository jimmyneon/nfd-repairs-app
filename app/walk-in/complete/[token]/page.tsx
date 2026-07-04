'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { CheckCircle, Loader2, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'

const TOTAL_STEPS = 2

export default function CompleteWalkInPage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [jobRef, setJobRef] = useState('')
  const [currentStep, setCurrentStep] = useState(0)

  const [formData, setFormData] = useState({
    deviceType: 'phone' as string,
    deviceMake: '',
    deviceModel: '',
    issue: '',
    description: '',
    notSure: false,
  })

  const supabase = createClient()

  const issueOptions: Record<string, string[]> = {
    phone: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Data Recovery', 'Software Issues', 'Other'],
    tablet: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Software Issues', 'Other'],
    laptop: ['Screen Replacement', 'Keyboard Replacement', 'Battery Replacement', 'Charging Issues', 'Windows Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    macbook: ['Screen Replacement', 'Battery Replacement', 'Keyboard Replacement', 'Charging Issues', 'macOS Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
    console: ['HDMI Port Replacement', 'Disc Drive Issues', 'Overheating', 'No Power', 'Software Issues', 'Controller Issues', 'Other'],
    other: ['Hardware Issue', 'Software Issue', 'Data Recovery', 'Other'],
  }

  useEffect(() => {
    loadJob()
  }, [params.token])

  const loadJob = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_ref, device_type, device_make, device_model, issue, description')
      .eq('tracking_token', params.token)
      .single()

    if (error || !data) {
      setError('Invalid or expired link')
      setLoading(false)
      return
    }

    setJobRef(data.job_ref)

    if (data.device_type) setFormData(prev => ({ ...prev, deviceType: data.device_type }))
    if (data.device_make && data.device_make !== 'To be added') setFormData(prev => ({ ...prev, deviceMake: data.device_make }))
    if (data.device_model && data.device_model !== 'To be added') setFormData(prev => ({ ...prev, deviceModel: data.device_model }))
    if (data.issue && data.issue !== 'To be assessed') setFormData(prev => ({ ...prev, issue: data.issue }))
    if (data.description) setFormData(prev => ({ ...prev, description: data.description }))

    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const goNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          device_type: formData.deviceType,
          device_make: formData.notSure ? 'To be assessed' : (formData.deviceMake.trim() || 'To be assessed'),
          device_model: formData.notSure ? 'To be assessed' : (formData.deviceModel.trim() || 'To be assessed'),
          issue: formData.notSure ? 'To be assessed' : (formData.issue || 'To be assessed'),
          description: formData.description.trim() || null,
        } as any)
        .eq('tracking_token', params.token)

      if (updateError) {
        setError('Failed to save details. Please try again.')
        setSubmitting(false)
        return
      }

      setSuccess(true)
    } catch (err) {
      console.error('Complete walk-in error:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && jobRef === '') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unable to Load</h1>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Details Saved!</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            We&apos;ve updated your repair details. You can track your repair status using the link below.
          </p>
          {jobRef && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-6">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Your Reference</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 font-mono">{jobRef}</p>
            </div>
          )}
          <a
            href={`/t/${params.token}`}
            className="inline-block bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-8 rounded-xl transition-colors"
          >
            Track My Repair
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">Complete Your Details</h1>
            <p className="text-gray-600 dark:text-gray-400">Fill in your device information so we can get started</p>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6">
            {[0, 1].map(i => (
              <div key={i} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i <= currentStep ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                  {i < currentStep ? <CheckCircle className="h-5 w-5" /> : i + 1}
                </div>
                {i < 1 && <div className={`w-8 h-1 ${i < currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
            {currentStep === 0 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Device details</h2>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" name="notSure" checked={formData.notSure} onChange={handleChange} className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">I&apos;m not sure — let staff figure it out</span>
                </label>
                {!formData.notSure && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Device Type</label>
                      <select name="deviceType" value={formData.deviceType} onChange={handleChange} className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="phone">Phone</option>
                        <option value="tablet">Tablet</option>
                        <option value="laptop">Laptop (Windows)</option>
                        <option value="macbook">MacBook (Apple)</option>
                        <option value="console">Games Console</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Device Make</label>
                      <input type="text" name="deviceMake" value={formData.deviceMake} onChange={handleChange} className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g., Apple, Samsung, HP" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Device Model</label>
                      <input type="text" name="deviceModel" value={formData.deviceModel} onChange={handleChange} className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g., iPhone 14 Pro, Galaxy S23" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">What&apos;s the issue?</label>
                      <select name="issue" value={formData.issue} onChange={handleChange} className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Select an issue...</option>
                        {(issueOptions[formData.deviceType] || []).map(issue => (
                          <option key={issue} value={issue}>{issue}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Additional Details (Optional)</label>
                      <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Tell us more about the problem..." />
                    </div>
                  </>
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Review your details</h2>
                <div className="space-y-3 text-sm">
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
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Please hand your device to a member of staff if you haven&apos;t already.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            {currentStep > 0 && (
              <button type="button" onClick={goBack} className="flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
            )}
            {currentStep < TOTAL_STEPS ? (
              <button type="button" onClick={goNext} className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-colors active:scale-95 text-lg">
                Next
                <ArrowRight className="h-5 w-5" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-95 text-white font-bold py-4 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-lg flex items-center justify-center gap-3">
                {submitting ? (
                  <><Loader2 className="h-6 w-6 animate-spin" />Saving...</>
                ) : (
                  <><CheckCircle className="h-6 w-6" />Save Details</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
