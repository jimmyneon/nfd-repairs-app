'use client'

import { useState } from 'react'
import { CheckCircle, X, AlertCircle, Lock, Unlock } from 'lucide-react'

interface CustomerConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (customerData: {
    device_password: string
    password_na: boolean
    terms_accepted: boolean
  }) => void
  jobData: {
    customer_name: string
    customer_phone: string
    customer_email: string
    device_make: string
    device_model: string
    device_type: string
    issue: string
    description: string
    price_total: string
    requires_parts_order: boolean
    device_left_with_us: boolean
  }
}

export default function CustomerConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  jobData,
}: CustomerConfirmationModalProps) {
  const [devicePassword, setDevicePassword] = useState('')
  const [passwordNA, setPasswordNA] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [diagnosticFeeAcknowledged, setDiagnosticFeeAcknowledged] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  if (!isOpen) return null

  const isSmallDevice = ['phone', 'tablet', 'watch'].includes(jobData.device_type)
  const diagnosticFee = isSmallDevice ? '£20' : '£40'
  const deviceCategory = isSmallDevice ? 'small device' : 'large device'

  const handleConfirm = () => {
    if (!passwordNA && !devicePassword.trim()) {
      alert('Please enter your device password or check "My device has no password"')
      return
    }

    if (!termsAccepted) {
      alert('Please accept the terms and conditions to proceed')
      return
    }

    if (!diagnosticFeeAcknowledged) {
      alert('Please acknowledge the diagnostic fee policy to proceed')
      return
    }

    onConfirm({
      device_password: passwordNA ? '' : devicePassword,
      password_na: passwordNA,
      terms_accepted: true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-2xl font-bold">Review Your Repair Details</h2>
          <p className="text-sm text-white/90 mt-1">Please review the information and confirm</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Job Summary */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-3">Repair Summary</h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Customer Name</p>
                <p className="font-semibold text-gray-900 dark:text-white">{jobData.customer_name}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Phone Number</p>
                <p className="font-semibold text-gray-900 dark:text-white">{jobData.customer_phone}</p>
              </div>
              
              {jobData.customer_email && (
                <div className="col-span-2">
                  <p className="text-gray-600 dark:text-gray-400">Email</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{jobData.customer_email}</p>
                </div>
              )}
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Device</p>
                <p className="font-semibold text-gray-900 dark:text-white">{jobData.device_make} {jobData.device_model}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Issue</p>
                <p className="font-semibold text-gray-900 dark:text-white">{jobData.issue}</p>
              </div>
              
              {jobData.description && (
                <div className="col-span-2">
                  <p className="text-gray-600 dark:text-gray-400">Description</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{jobData.description}</p>
                </div>
              )}
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Total Price</p>
                <p className="font-semibold text-gray-900 dark:text-white text-lg">£{parseFloat(jobData.price_total).toFixed(2)}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Parts Required</p>
                <p className="font-semibold text-gray-900 dark:text-white">{jobData.requires_parts_order ? 'Yes (£20 deposit)' : 'No'}</p>
              </div>
              
              <div className="col-span-2">
                <p className="text-gray-600 dark:text-gray-400">Device Status</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {jobData.device_left_with_us ? '✓ Left with us today' : 'To be dropped off later'}
                </p>
              </div>
            </div>
          </div>

          {/* Device Password Section */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Device Password/Passcode
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              We need your device password to test it after the repair is complete.
            </p>
            
            <input
              type="text"
              value={devicePassword}
              onChange={(e) => {
                setDevicePassword(e.target.value)
                if (e.target.value) setPasswordNA(false)
              }}
              disabled={passwordNA}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-600 mb-2"
              placeholder="Enter your device password"
            />
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="passwordNA"
                checked={passwordNA}
                onChange={(e) => {
                  setPasswordNA(e.target.checked)
                  if (e.target.checked) setDevicePassword('')
                }}
                className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="passwordNA" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1 cursor-pointer">
                <Unlock className="h-4 w-4" />
                My device has no password
              </label>
            </div>
          </div>

          {/* Diagnostic Fee Notice */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5" />
              Diagnostic Fee Information
            </h3>
            <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
              <p>
                <strong>Where diagnostics are required:</strong>
              </p>
              <p className="ml-4">
                • Your device is a <strong>{deviceCategory}</strong><br />
                • Minimum diagnostic charge: <strong>{diagnosticFee}</strong>
              </p>
              <p className="text-xs mt-2">
                This fee applies only if we need to diagnose the issue before providing a repair quote. 
                It will be deducted from the final repair cost if you proceed with the repair.
              </p>
            </div>
          </div>

          {/* Diagnostic Fee Acknowledgment */}
          <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl">
            <input
              type="checkbox"
              id="diagnosticFee"
              checked={diagnosticFeeAcknowledged}
              onChange={(e) => setDiagnosticFeeAcknowledged(e.target.checked)}
              className="w-6 h-6 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded mt-0.5 cursor-pointer"
            />
            <label htmlFor="diagnosticFee" className="text-sm text-gray-900 dark:text-white cursor-pointer">
              <strong>I understand the diagnostic fee policy</strong>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                I acknowledge that diagnostic fees may apply as outlined above.
              </p>
            </label>
          </div>

          {/* Terms and Conditions */}
          <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <input
              type="checkbox"
              id="terms"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-6 h-6 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 cursor-pointer"
            />
            <label htmlFor="terms" className="text-sm text-gray-900 dark:text-white cursor-pointer">
              <strong>I accept the terms and conditions</strong>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Confirm & Create Job
            </button>
          </div>
        </div>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Terms and Conditions</h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
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
