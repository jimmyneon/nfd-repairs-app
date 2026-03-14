'use client'

import { useState } from 'react'
import { CheckCircle, X, AlertCircle, Lock, Unlock } from 'lucide-react'

interface CustomerConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (customerData: {
    customer_name: string
    customer_phone: string
    customer_email: string
    device_password: string
    password_na: boolean
    passcode_method: string
    terms_accepted: boolean
  }) => void
  jobData: {
    device_make: string
    device_model: string
    device_type: string
    issue: string
    description: string
    price_total: string
    requires_parts_order: boolean
    device_left_with_us: boolean
  }
  passcodeRequirement: 'not_required' | 'recommended' | 'required'
}

export default function CustomerConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  jobData,
  passcodeRequirement,
}: CustomerConfirmationModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [devicePassword, setDevicePassword] = useState('')
  const [passwordNA, setPasswordNA] = useState(false)
  const [passcodeMethod, setPasscodeMethod] = useState('provided')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [diagnosticFeeAcknowledged, setDiagnosticFeeAcknowledged] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  if (!isOpen) return null

  const isSmallDevice = ['phone', 'tablet', 'watch'].includes(jobData.device_type)
  const diagnosticFee = isSmallDevice ? '£20' : '£40'
  const deviceCategory = isSmallDevice ? 'small device' : 'large device'

  const handleConfirm = () => {
    if (!customerName.trim()) {
      alert('Please enter your full name')
      return
    }

    if (!customerPhone.trim()) {
      alert('Please enter your mobile phone number')
      return
    }

    // Validate passcode if required or recommended
    if (passcodeRequirement !== 'not_required') {
      if (passcodeMethod === 'provided' && !passwordNA && !devicePassword.trim()) {
        alert('Please enter your device passcode or select another option')
        return
      }
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
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      device_password: (passwordNA || passcodeMethod !== 'provided') ? '' : devicePassword,
      password_na: passwordNA || passcodeMethod === 'not_applicable',
      passcode_method: passcodeMethod,
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
          <h2 className="text-2xl font-bold">Customer Details & Confirmation</h2>
          <p className="text-sm text-white/90 mt-1">Please enter your details and review the repair information</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Customer Details Input */}
          <div className="bg-white dark:bg-gray-800 border-2 border-primary rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Your Details</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="John Smith"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mobile Phone Number *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="07410 123456"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="your.email@example.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Email is optional. If provided you'll receive more detailed repair updates. Otherwise you'll receive a repair tracking link by SMS.
                </p>
              </div>
            </div>
          </div>

          {/* Job Summary */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-3">Repair Summary</h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
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

          {/* Device Passcode Section - Conditional */}
          {passcodeRequirement !== 'not_required' && (
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Device Passcode {passcodeRequirement === 'required' && <span className="text-red-600">*</span>}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Used only for testing after repair. Stored securely and automatically deleted 7 days after collection.
              </p>
              
              <div className="space-y-3">
                <label className="flex items-start space-x-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcode_method"
                    value="provided"
                    checked={passcodeMethod === 'provided'}
                    onChange={(e) => {
                      setPasscodeMethod(e.target.value)
                      setPasswordNA(false)
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-2">Enter passcode now</div>
                    {passcodeMethod === 'provided' && (
                      <input
                        type="text"
                        value={devicePassword}
                        onChange={(e) => setDevicePassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Enter your device passcode"
                      />
                    )}
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcode_method"
                    value="will_remove"
                    checked={passcodeMethod === 'will_remove'}
                    onChange={(e) => {
                      setPasscodeMethod(e.target.value)
                      setDevicePassword('')
                      setPasswordNA(false)
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">I will remove the passcode</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Remove passcode before dropping off device</div>
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcode_method"
                    value="send_link"
                    checked={passcodeMethod === 'send_link'}
                    onChange={(e) => {
                      setPasscodeMethod(e.target.value)
                      setDevicePassword('')
                      setPasswordNA(false)
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Send secure link later</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">We'll send you a secure link to provide passcode when needed</div>
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcode_method"
                    value="not_applicable"
                    checked={passcodeMethod === 'not_applicable'}
                    onChange={(e) => {
                      setPasscodeMethod(e.target.value)
                      setDevicePassword('')
                      setPasswordNA(true)
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Device has no passcode</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">My device doesn't have a passcode set</div>
                  </div>
                </label>
              </div>
            </div>
          )}

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

          {/* Repair Agreement */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Repair Agreement</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 mb-3 list-disc list-inside">
              <li>Diagnostic work may incur a minimum charge</li>
              <li>Data loss is possible during repair</li>
              <li>Additional faults may be discovered during repair</li>
              <li>Uncollected devices may incur storage fees</li>
            </ul>
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 cursor-pointer"
              />
              <label htmlFor="terms" className="text-sm text-gray-900 dark:text-white cursor-pointer">
                <strong>I agree to the repair terms</strong>
                {' '}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="text-primary font-semibold hover:underline"
                >
                  (View full terms)
                </button>
              </label>
            </div>
          </div>

          {/* Action Button - No Cancel */}
          <div className="pt-4">
            <button
              onClick={handleConfirm}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Confirm Booking
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
