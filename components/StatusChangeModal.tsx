'use client'

import { useState } from 'react'
import { X, AlertTriangle, MessageSquare } from 'lucide-react'
import { JobStatus } from '@/lib/types'
import { JOB_STATUS_LABELS } from '@/lib/constants'

interface StatusChangeModalProps {
  currentStatus: JobStatus
  newStatus: JobStatus
  deviceInfo: string
  onConfirm: () => void
  onCancel: () => void
  willSendSMS: boolean
}

export default function StatusChangeModal({
  currentStatus,
  newStatus,
  deviceInfo,
  onConfirm,
  onCancel,
  willSendSMS
}: StatusChangeModalProps) {
  const [step, setStep] = useState<'initial' | 'confirm' | 'final'>('initial')
  const [countdown, setCountdown] = useState(3)

  const handleFirstConfirm = () => {
    setStep('confirm')
  }

  const handleSecondConfirm = () => {
    setStep('final')
    // Start countdown
    let count = 3
    const interval = setInterval(() => {
      count--
      setCountdown(count)
      if (count === 0) {
        clearInterval(interval)
        onConfirm()
      }
    }, 1000)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Confirm Status Change</h2>
              <p className="text-sm text-gray-600">{deviceInfo}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
            disabled={step === 'final'}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Status Change Info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Current Status</span>
            <span className="text-sm font-bold text-gray-900">{JOB_STATUS_LABELS[currentStatus]}</span>
          </div>
          <div className="flex items-center justify-center my-2">
            <div className="text-2xl text-primary">↓</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">New Status</span>
            <span className="text-sm font-bold text-primary">{JOB_STATUS_LABELS[newStatus]}</span>
          </div>
        </div>

        {/* SMS Warning */}
        {willSendSMS && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-start space-x-3">
              <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-blue-900 mb-1">SMS Will Be Sent</p>
                <p className="text-xs text-blue-700">
                  Customer will receive an automated SMS notification about this status change.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step-based Content */}
        {step === 'initial' && (
          <>
            <p className="text-gray-700 mb-6">
              Are you sure you want to change the status? This action will update the job and may trigger notifications.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-4 px-6 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFirstConfirm}
                className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-4 px-6 rounded-xl transition-colors"
              >
                Yes, Continue
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-900 font-bold mb-2">⚠️ Final Confirmation</p>
              <p className="text-sm text-red-700">
                This is your last chance to cancel. Click "Definitely Sure" to proceed with the status change.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-4 px-6 rounded-xl transition-colors"
              >
                No, Go Back
              </button>
              <button
                onClick={handleSecondConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
              >
                Definitely Sure
              </button>
            </div>
          </>
        )}

        {step === 'final' && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl font-bold text-white">{countdown}</span>
            </div>
            <p className="text-gray-700 font-medium">Processing status change...</p>
            <p className="text-sm text-gray-500 mt-2">Please wait</p>
          </div>
        )}
      </div>
    </div>
  )
}
