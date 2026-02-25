'use client'

import { useState } from 'react'
import { CheckCircle, X, AlertCircle } from 'lucide-react'

interface ManualJobConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  jobData: {
    customer_name: string
    customer_phone: string
    customer_email: string
    device_make: string
    device_model: string
    issue: string
    price_total: string
    requires_parts_order: boolean
    device_left_with_us: boolean
  }
}

export default function ManualJobConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  jobData,
}: ManualJobConfirmationModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [diagnosticFeeAcknowledged, setDiagnosticFeeAcknowledged] = useState(false)

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!termsAccepted || !diagnosticFeeAcknowledged) {
      alert('Please confirm all checkboxes before proceeding')
      return
    }
    onConfirm()
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
          <h2 className="text-2xl font-bold">Customer Confirmation Required</h2>
          <p className="text-sm text-white/90 mt-1">Please review and confirm the repair details</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Job Summary */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Repair Summary
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Customer Name</p>
                <p className="font-medium text-gray-900 dark:text-white">{jobData.customer_name}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Phone</p>
                <p className="font-medium text-gray-900 dark:text-white">{jobData.customer_phone}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Device</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {jobData.device_make} {jobData.device_model}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Issue</p>
                <p className="font-medium text-gray-900 dark:text-white">{jobData.issue}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Quoted Price</p>
                <p className="font-medium text-gray-900 dark:text-white">£{jobData.price_total}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Parts Required</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {jobData.requires_parts_order ? 'Yes (£20 deposit)' : 'No'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-600 dark:text-gray-400">Device Status</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {jobData.device_left_with_us ? '✅ Left with us' : '❌ Customer taking away'}
                </p>
              </div>
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
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Small devices</strong> (phones, tablets, watches): Minimum charge £20</li>
                <li><strong>Large devices</strong> (laptops, desktops, consoles): Minimum charge £40</li>
              </ul>
              <p className="text-xs mt-2 text-yellow-700 dark:text-yellow-300">
                This fee applies if we need to diagnose the issue before providing a repair quote. 
                It will be deducted from the final repair cost if you proceed with the repair.
              </p>
            </div>
          </div>

          {/* Diagnostic Fee Acknowledgment */}
          <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border-2 border-yellow-200 dark:border-yellow-800">
            <input
              type="checkbox"
              checked={diagnosticFeeAcknowledged}
              onChange={(e) => setDiagnosticFeeAcknowledged(e.target.checked)}
              className="w-6 h-6 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded mt-0.5 cursor-pointer"
              id="diagnostic_fee_acknowledged"
            />
            <label htmlFor="diagnostic_fee_acknowledged" className="text-sm text-gray-900 dark:text-white cursor-pointer">
              <strong>I understand the diagnostic fee policy</strong>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Customer acknowledges that diagnostic fees may apply as outlined above.
              </p>
            </label>
          </div>

          {/* Terms Acceptance */}
          <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-200 dark:border-blue-800">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-6 h-6 text-primary focus:ring-primary border-gray-300 rounded mt-0.5 cursor-pointer"
              id="terms_accepted_modal"
            />
            <label htmlFor="terms_accepted_modal" className="text-sm text-gray-900 dark:text-white cursor-pointer">
              <strong>Customer accepts terms and conditions</strong>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                By checking this box, the customer agrees to our repair terms and conditions, 
                including warranty coverage, liability limitations, and diagnostic fee policy.
              </p>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!termsAccepted || !diagnosticFeeAcknowledged}
              className="flex-1 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Confirm & Create Job
            </button>
          </div>

          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            This confirmation serves as the customer's agreement to proceed with the repair
          </p>
        </div>
      </div>
    </div>
  )
}
