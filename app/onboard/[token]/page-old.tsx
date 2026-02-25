'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Loader2, CheckCircle, AlertCircle, X, FileText, Mail, Lock, Unlock } from 'lucide-react'
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
    setError(null)

    // Validation
    if (!formData.emailOptOut && !formData.email) {
      setError('Please provide an email address or check "I don\'t have an email"')
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

    if (!formData.diagnosticFeeAcknowledged) {
      setError('Please acknowledge the diagnostic fee policy')
      return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.lineTo(x, y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignature(canvas.toDataURL())
    }
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignature(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!job) return

    // Validation
    if (!formData.email && !formData.emailOptOut) {
      setError('Please provide email address or select "No Email"')
      return
    }

    if (!formData.passwordNA && !formData.devicePassword) {
      setError('Please provide device password or check "No Password"')
      return
    }

    if (!formData.termsAccepted) {
      setError('Please accept the terms and conditions')
      return
    }

    if (!signature) {
      setError('Please provide your signature')
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
          customer_signature: signature,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        })
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
      })

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
      router.push(`/repair/${job.id}`)
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
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white">
      <div className="max-w-2xl mx-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary-dark p-6 text-white">
            <h1 className="text-2xl font-bold mb-2">Complete Your Repair Details</h1>
            <p className="text-primary-light">Job Reference: {job.job_ref}</p>
          </div>

          {/* Job Summary */}
          <div className="p-6 bg-gray-50 border-b">
            <h2 className="font-bold text-gray-900 mb-3">Repair Summary</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-600">Device:</span> <span className="font-semibold">{job.device_make} {job.device_model}</span></p>
              <p><span className="text-gray-600">Issue:</span> <span className="font-semibold">{job.issue}</span></p>
              <p><span className="text-gray-600">Price:</span> <span className="font-semibold">£{job.price_total.toFixed(2)}</span></p>
            </div>

            {/* Deposit Alert */}
            {job.deposit_required && (
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

            {/* Diagnostic Fee Acknowledgment */}
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

      {/* Terms and Conditions Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="h-6 w-6 mr-2 text-primary" />
                Terms and Conditions
              </h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="prose prose-sm max-w-none">
                <h3>New Forest Device Repairs - Repair Terms & Conditions</h3>
                
                <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-GB')}</p>

                <h4>1. Acceptance of Terms</h4>
                <p>By submitting your device for repair, you agree to these terms and conditions. Please read them carefully.</p>

                <h4>2. Device Information</h4>
                <p>You confirm that:</p>
                <ul>
                  <li>All information provided about your device is accurate</li>
                  <li>You are the legal owner of the device or have authorization to repair it</li>
                  <li>You have provided any necessary passwords or access codes</li>
                  <li>You have backed up all important data before submitting the device</li>
                </ul>

                <h4>3. Data and Privacy</h4>
                <p>We take data protection seriously:</p>
                <ul>
                  <li>We are not responsible for any data loss during the repair process</li>
                  <li>You should back up all data before repair</li>
                  <li>We may need to access your device to test functionality</li>
                  <li>Any passwords provided will be kept secure and deleted after repair</li>
                  <li>We will not access personal data unless necessary for testing</li>
                </ul>

                <h4>4. Repair Process</h4>
                <p>Our repair service includes:</p>
                <ul>
                  <li>Professional diagnosis of the reported issue</li>
                  <li>Use of quality replacement parts where required</li>
                  <li>Testing of the device after repair</li>
                  <li>Updates on repair progress via SMS and email</li>
                </ul>

                <h4>5. Payment Terms</h4>
                <ul>
                  <li>Prices quoted are valid for 30 days</li>
                  <li>A deposit may be required for parts ordering</li>
                  <li>Full payment is due upon collection</li>
                  <li>We accept cash, card, and bank transfer</li>
                </ul>

                <h4>6. Warranty</h4>
                <p>All repairs come with our warranty:</p>
                <ul>
                  <li>Warranty period varies by repair type (typically 90 days)</li>
                  <li>Warranty covers parts and workmanship</li>
                  <li>Warranty does not cover accidental damage, liquid damage, or misuse</li>
                  <li>Original receipt must be presented for warranty claims</li>
                </ul>

                <h4>7. Collection</h4>
                <ul>
                  <li>Devices must be collected within 30 days of repair completion</li>
                  <li>After 30 days, a storage fee may apply</li>
                  <li>We reserve the right to dispose of uncollected devices after 90 days</li>
                </ul>

                <h4>8. Liability</h4>
                <ul>
                  <li>Our liability is limited to the repair cost</li>
                  <li>We are not liable for consequential losses</li>
                  <li>We are not responsible for pre-existing faults not reported</li>
                  <li>Some repairs may void manufacturer warranties</li>
                </ul>

                <h4>9. Cancellation</h4>
                <ul>
                  <li>You may cancel before work begins</li>
                  <li>Diagnostic fees may apply for cancellations</li>
                  <li>Deposits for ordered parts are non-refundable</li>
                </ul>

                <h4>10. Contact Information</h4>
                <p>
                  <strong>New Forest Device Repairs</strong><br />
                  Phone: 07410 381247<br />
                  Email: repairs@newforestdevicerepairs.co.uk<br />
                  Web: newforestdevicerepairs.co.uk
                </p>

                <p className="text-sm text-gray-600 mt-6">
                  By signing above, you confirm that you have read, understood, and agree to these terms and conditions.
                </p>
              </div>
            </div>

            <div className="p-6 border-t">
              <button
                onClick={() => setShowTerms(false)}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
