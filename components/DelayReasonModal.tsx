'use client'

import { useState } from 'react'
import { X, Clock } from 'lucide-react'

interface DelayReasonModalProps {
  onConfirm: (reason: string, notes: string) => void
  onCancel: () => void
  deviceInfo: string
}

const DELAY_REASONS = [
  { value: 'AWAITING_PARTS', label: 'Awaiting Parts Delivery' },
  { value: 'PARTS_DELAYED', label: 'Parts Delivery Delayed' },
  { value: 'TECHNICAL_ISSUE', label: 'Technical Issue Discovered' },
  { value: 'AWAITING_CUSTOMER_RESPONSE', label: 'Awaiting Customer Response' },
  { value: 'WORKLOAD_BACKLOG', label: 'Workload Backlog' },
  { value: 'SPECIALIST_REQUIRED', label: 'Specialist Required' },
  { value: 'OTHER', label: 'Other Reason' },
]

export default function DelayReasonModal({
  onConfirm,
  onCancel,
  deviceInfo
}: DelayReasonModalProps) {
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
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <Clock className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Mark as Delayed</h2>
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

        {/* Reason Selection */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Delay Reason *
          </label>
          <div className="space-y-2">
            {DELAY_REASONS.map((reason) => (
              <button
                key={reason.value}
                onClick={() => setSelectedReason(reason.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  selectedReason === reason.value
                    ? 'border-red-500 bg-red-50 text-red-900 font-semibold'
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
            placeholder="e.g., Expected completion date, specific details..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
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
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Confirm Delay
          </button>
        </div>
      </div>
    </div>
  )
}
