'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { X, Mail, Lock, Unlock, FileText, Loader2, CheckCircle } from 'lucide-react'

interface ManualOnboardingModalProps {
  jobId: string
  jobRef: string
  customerName: string
  onComplete: () => void
  onClose: () => void
}

export default function ManualOnboardingModal({
  jobId,
  jobRef,
  customerName,
  onComplete,
  onClose,
}: ManualOnboardingModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    emailOptOut: false,
    devicePassword: '',
    passwordNA: false,
    termsAccepted: false,
  })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = createClient()

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

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
      setError('Customer must accept terms and conditions')
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
          customer_signature: signature || null,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        } as any)
        .eq('id', jobId)

      if (updateError) {
        throw updateError
      }

      // Log event
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: formData.emailOptOut
          ? 'Staff completed onboarding in-shop (SMS only - no email provided)'
          : 'Staff completed onboarding in-shop',
      } as any)

      // If email opted out, send tracking link SMS
      if (formData.emailOptOut) {
        try {
          await fetch('/api/jobs/send-tracking-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
          })
        } catch (err) {
          console.error('Failed to send tracking SMS:', err)
        }
      }

      onComplete()
    } catch (err) {
      console.error('Manual onboarding error:', err)
      setError('Failed to complete onboarding. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex items-center justify-between bg-primary text-white">
          <div>
            <h2 className="text-2xl font-bold">Complete Customer Onboarding</h2>
            <p className="text-sm text-primary-light">Job: {jobRef} - {customerName}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
              placeholder="customer@example.com"
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
                Customer has no email (SMS only)
              </label>
            </div>
          </div>

          {/* Device Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Lock className="h-4 w-4 inline mr-2" />
              Device Password/Passcode *
            </label>
            <input
              type="text"
              value={formData.devicePassword}
              onChange={(e) => setFormData({ ...formData, devicePassword: e.target.value, passwordNA: false })}
              disabled={formData.passwordNA}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
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
                Device has no password
              </label>
            </div>
          </div>

          {/* Terms Acceptance */}
          <div className="border-2 border-gray-200 rounded-xl p-4">
            <div className="flex items-start space-x-3 mb-3">
              <input
                type="checkbox"
                id="terms"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5"
              />
              <label htmlFor="terms" className="text-sm text-gray-700 flex-1">
                <FileText className="h-4 w-4 inline mr-1" />
                Customer has read and agreed to Terms & Conditions
              </label>
            </div>

            {/* Signature Pad */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Signature (Optional)
              </label>
              <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full bg-white cursor-crosshair touch-none"
                  style={{ touchAction: 'none' }}
                />
              </div>
              <button
                type="button"
                onClick={clearSignature}
                className="mt-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear Signature
              </button>
            </div>
          </div>
        </form>

        <div className="p-6 border-t bg-gray-50 flex space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                <span>Complete Onboarding</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
