'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Loader2, CheckCircle, AlertCircle, X, FileText, Mail, Lock, Unlock, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Job {
  id: string
  job_ref: string
  customer_name: string
  customer_email: string | null
  device_make: string
  device_model: string
  issue: string
  price_total: number
  deposit_required: boolean
  deposit_amount: number | null
  onboarding_completed: boolean
  terms_accepted: boolean
  device_password: string | null
  password_not_applicable: boolean
  is_warranty: boolean
}

export default function OnboardingPage({ params }: { params: { token: string } }) {
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  
  const [formData, setFormData] = useState({
    email: '',
    emailOptOut: false,
    devicePassword: '',
    passwordNA: false,
    termsAccepted: false,
    diagnosticFeeAcknowledged: false,
  })

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadJob()
  }, [params.token])

  const loadJob = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('onboarding_token', params.token)
      .single()

    if (error || !data) {
      setError('Invalid or expired link')
      setLoading(false)
      return
    }

    if (data.onboarding_completed) {
      setError('Onboarding already completed')
      setLoading(false)
      return
    }

    setJob(data)
    setFormData({
      email: data.customer_email || '',
      emailOptOut: false,
      devicePassword: data.device_password || '',
      passwordNA: data.password_not_applicable || false,
      termsAccepted: data.terms_accepted || false,
      diagnosticFeeAcknowledged: false,
    })
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!job) return

    // Validation
    if (!formData.email && !formData.emailOptOut) {
      setError('Please provide email address or select "I don\'t have an email"')
      return
    }

    if (!formData.passwordNA && !formData.devicePassword) {
      setError('Please provide device password or check "My device has no password"')
      return
    }

    if (!formData.termsAccepted) {
      setError('Please accept the terms and conditions')
      return
    }

    if (!job.is_warranty && !formData.diagnosticFeeAcknowledged) {
      setError('Please acknowledge the diagnostic fee policy')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          customer_email: formData.emailOptOut ? null : formData.email,
          device_password: formData.passwordNA ? null : formData.devicePassword,
          password_not_applicable: formData.passwordNA,
          customer_signature: null,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        } as any)
        .eq('onboarding_token', params.token)

      if (updateError) {
        throw updateError
      }

      // Log event
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: formData.emailOptOut 
          ? 'Customer completed onboarding (SMS only - no email provided)'
          : 'Customer completed onboarding',
      } as any)

      // If email opted out, send tracking link SMS
      if (formData.emailOptOut) {
        try {
          await fetch('/api/jobs/send-tracking-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id }),
          })
        } catch (err) {
          console.error('Failed to send tracking SMS:', err)
        }
      }

      // Success - redirect to tracking page
      router.push(`/t/${job.tracking_token || job.id}`)
    } catch (err) {
      console.error('Onboarding error:', err)
      setError('Failed to complete onboarding. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!job) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary-dark p-6 text-white">
            <h1 className="text-2xl font-bold mb-2">Complete Your Repair Booking</h1>
            <p className="text-sm opacity-90">Job Reference: {job.job_ref}</p>
          </div>

          {/* Job Summary */}
          <div className="bg-gray-50 p-6 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-primary" />
              Repair Details
            </h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-600">Customer:</span> <span className="font-semibold">{job.customer_name}</span></p>
              <p><span className="text-gray-600">Device:</span> <span className="font-semibold">{job.device_make} {job.device_model}</span></p>
              <p><span className="text-gray-600">Issue:</span> <span className="font-semibold">{job.issue}</span></p>
              {job.is_warranty ? (
                <p><span className="text-gray-600">Price:</span> <span className="font-semibold text-green-600">Warranty repair — no charge</span></p>
              ) : (
                <p><span className="text-gray-600">Price:</span> <span className="font-semibold">£{job.price_total.toFixed(2)}</span></p>
              )}
            </div>

            {/* Deposit Alert */}
            {job.deposit_required && !job.is_warranty && (
              <div className="mt-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                <h3 className="font-bold text-amber-900 mb-2 flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Deposit Required
                </h3>
                <p className="text-sm text-amber-800 mb-2">
                  A deposit of <span className="font-bold">£{job.deposit_amount?.toFixed(2) || '20.00'}</span> is required for parts ordering.
                </p>
                <p className="text-xs text-amber-700">
                  You'll receive payment details after completing this form.
                </p>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="h-4 w-4 inline mr-2" />
                Email Address {!formData.emailOptOut && '*'}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value, emailOptOut: false })}
                disabled={formData.emailOptOut}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="your.email@example.com"
              />
              <div className="mt-2 flex items-center">
                <input
                  type="checkbox"
                  id="emailOptOut"
                  checked={formData.emailOptOut}
                  onChange={(e) => setFormData({ ...formData, emailOptOut: e.target.checked, email: '' })}
                  className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor="emailOptOut" className="ml-2 text-sm text-gray-700">
                  I don't have an email address (SMS only)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formData.emailOptOut 
                  ? 'You will receive updates via SMS and tracking link only'
                  : 'We\'ll send detailed repair updates to this email'}
              </p>
            </div>

            {/* Device Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="h-4 w-4 inline mr-2" />
                Device Password/Passcode
              </label>
              <input
                type="text"
                value={formData.devicePassword}
                onChange={(e) => setFormData({ ...formData, devicePassword: e.target.value, passwordNA: false })}
                disabled={formData.passwordNA}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="Enter device password"
              />
              <div className="mt-2 flex items-center">
                <input
                  type="checkbox"
                  id="passwordNA"
                  checked={formData.passwordNA}
                  onChange={(e) => setFormData({ ...formData, passwordNA: e.target.checked, devicePassword: '' })}
                  className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <label htmlFor="passwordNA" className="ml-2 text-sm text-gray-700 flex items-center">
                  <Unlock className="h-4 w-4 mr-1" />
                  My device has no password
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Required to test your device after repair</p>
            </div>

            {/* Diagnostic Fee Notice */}
            {!job.is_warranty && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-900 flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5" />
                Diagnostic Fee Information
              </h3>
              <div className="space-y-2 text-sm text-yellow-800">
                <p>
                  <strong>Where diagnostics are required:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Small devices</strong> (phones, tablets, watches): Minimum charge £20</li>
                  <li><strong>Large devices</strong> (laptops, desktops, consoles): Minimum charge £40</li>
                </ul>
                <p className="text-xs mt-2 text-yellow-700">
                  This fee applies if we need to diagnose the issue before providing a repair quote. 
                  It will be deducted from the final repair cost if you proceed with the repair.
                </p>
              </div>
            </div>
            )}

            {/* Warranty notice for warranty jobs */}
            {job.is_warranty && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                <h3 className="font-semibold text-green-900 flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5" />
                  Warranty Repair
                </h3>
                <p className="text-sm text-green-800">
                  This repair is covered under warranty — there is no charge for this service.
                </p>
              </div>
            )}

            {/* Diagnostic Fee Acknowledgment */}
            {!job.is_warranty && (
            <div className="flex items-start space-x-3 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
              <input
                type="checkbox"
                id="diagnosticFee"
                checked={formData.diagnosticFeeAcknowledged}
                onChange={(e) => setFormData({ ...formData, diagnosticFeeAcknowledged: e.target.checked })}
                className="w-6 h-6 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded mt-0.5 cursor-pointer"
              />
              <label htmlFor="diagnosticFee" className="text-sm text-gray-900 cursor-pointer">
                <strong>I understand the diagnostic fee policy</strong>
                <p className="text-xs text-gray-600 mt-1">
                  I acknowledge that diagnostic fees may apply as outlined above.
                </p>
              </label>
            </div>
            )}

            {/* Terms and Conditions */}
            <div className="flex items-start space-x-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <input
                type="checkbox"
                id="terms"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                className="w-6 h-6 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 cursor-pointer"
              />
              <label htmlFor="terms" className="text-sm text-gray-900 cursor-pointer">
                <strong>I accept the terms and conditions</strong>
                <p className="text-xs text-gray-600 mt-1">
                  By checking this box, I agree to the repair terms and conditions, 
                  including warranty coverage, liability limitations, and diagnostic fee policy.{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-primary font-semibold hover:underline"
                  >
                    View full terms
                  </button>
                </p>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete & Continue</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Terms and Conditions</h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-700">
              <p>By using our repair services, you agree to the following terms:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>We will handle your device with care but are not liable for data loss</li>
                <li>Repairs are guaranteed for 90 days from completion</li>
                <li>Deposits are non-refundable once parts are ordered</li>
                <li>Diagnostic fees apply where diagnostics are required (£20 small devices, £40 large devices)</li>
                <li>We reserve the right to refuse service</li>
                <li>You authorize us to test your device using the provided password</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
