'use client'

import { useState } from 'react'
import { X, XCircle } from 'lucide-react'

interface CancellationReasonModalProps {
  onConfirm: (reason: string, notes: string) => void
  onCancel: () => void
  deviceInfo: string
}

const CANCELLATION_REASONS = [
  { value: 'CUSTOMER_CANCELLED', label: 'Customer Requested Cancellation' },
  { value: 'UNECONOMICAL', label: 'Uneconomical to Repair' },
  { value: 'UNREPAIRABLE', label: 'Device Unrepairable' },
  { value: 'TOO_EXPENSIVE', label: 'Repair Cost Too High for Customer' },
  { value: 'NO_RESPONSE', label: 'No Customer Response' },
  { value: 'PARTS_UNAVAILABLE', label: 'Parts Unavailable' },
  { value: 'CUSTOMER_FOUND_ALTERNATIVE', label: 'Customer Found Alternative Solution' },
  { value: 'CUSTOMER_DECLINED_QUOTE', label: 'Customer Declined Quote' },
  { value: 'OTHER', label: 'Other Reason' },
]

export default function CancellationReasonModal({
  onConfirm,
  onCancel,
  deviceInfo
}: CancellationReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState('')
  const [notes, setNotes] = useState('')

  const handleConfirm = () => {
    if (!selectedReason) return
    onConfirm(selectedReason, notes)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Cancel Job</h2>
              <p className="text-sm text-gray-600">{deviceInfo}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ Warning:</strong> This action will cancel the repair job. The customer will be notified via SMS.
          </p>
        </div>

        {/* Reason Selection */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Cancellation Reason *
          </label>
          <div className="space-y-2">
            {CANCELLATION_REASONS.map((reason) => (
              <button
                key={reason.value}
                onClick={() => setSelectedReason(reason.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  selectedReason === reason.value
                    ? 'border-gray-600 bg-gray-50 text-gray-900 font-semibold'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Additional Notes (sent to customer)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Refund details, next steps, alternative options..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">
            These notes will be included in the SMS to the customer
          </p>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason}
            className="flex-1 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  )
}
