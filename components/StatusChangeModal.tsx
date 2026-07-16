'use client'

import { useState } from 'react'
import { X, AlertTriangle, MessageSquare } from 'lucide-react'
import { JobStatus } from '@/lib/types'
import { JOB_STATUS_LABELS } from '@/lib/constants'

interface StatusChangeModalProps {
  currentStatus: JobStatus
  newStatus: JobStatus
  deviceInfo: string
  onConfirm: (overrideSMS: boolean, overrideEmail: boolean) => void
  onCancel: () => void
  willSendSMS: boolean
  willSendEmail?: boolean
  showPriceOption?: boolean
  priceValue?: number
  sendPriceInSms?: boolean
  onSendPriceInSmsChange?: (value: boolean) => void
}

export default function StatusChangeModal({
  currentStatus,
  newStatus,
  deviceInfo,
  onConfirm,
  onCancel,
  willSendSMS,
  willSendEmail = false,
  showPriceOption = false,
  priceValue = 0,
  sendPriceInSms = true,
  onSendPriceInSmsChange
}: StatusChangeModalProps) {
  const [sendSMS, setSendSMS] = useState(willSendSMS)
  const [sendEmail, setSendEmail] = useState(willSendEmail)

  const handleConfirm = () => {
    onConfirm(!sendSMS, !sendEmail)
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

        {/* Notification Warning */}
        {(willSendSMS || willSendEmail) && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-start space-x-3">
              <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-900 mb-2">Notifications Will Be Sent</p>
                <div className="space-y-2">
                  {willSendSMS && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendSMS}
                        onChange={(e) => setSendSMS(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-xs text-blue-900">
                        <span className="font-semibold">SMS</span> - Customer will receive a text message
                      </span>
                    </label>
                  )}
                  {willSendEmail && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-xs text-blue-900">
                        <span className="font-semibold">Email</span> - Customer will receive an email
                      </span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-blue-600 mt-2">Uncheck to skip sending that notification</p>

                {showPriceOption && priceValue > 0 && sendSMS && (
                  <label className="flex items-center gap-2 cursor-pointer mt-3 pt-3 border-t border-blue-200">
                    <input
                      type="checkbox"
                      checked={sendPriceInSms}
                      onChange={(e) => onSendPriceInSmsChange?.(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-xs text-blue-900">
                      <span className="font-semibold">Include price (£{priceValue.toFixed(2)})</span> in SMS
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Single Confirm */}
        <p className="text-gray-700 mb-6">
          Change status to <span className="font-bold text-primary">{JOB_STATUS_LABELS[newStatus]}</span>?
        </p>
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
