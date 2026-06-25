'use client'

import { X, Trash2, ArrowRight } from 'lucide-react'
import { JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS } from '@/lib/constants'
import { useState } from 'react'

interface QuickActionsModalProps {
  jobRef: string
  deviceInfo: string
  currentStatus: JobStatus
  onSelectStatus: (status: JobStatus) => void
  onDelete: () => void
  onClose: () => void
}

export default function QuickActionsModal({
  jobRef,
  deviceInfo,
  currentStatus,
  onSelectStatus,
  onDelete,
  onClose
}: QuickActionsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const statuses: JobStatus[] = [
    'QUOTE_APPROVED',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED',
  ]

  const getStatusColor = (status: JobStatus) => {
    const colors: Record<JobStatus, string> = {
      QUOTE_APPROVED: 'bg-cyan-600 hover:bg-cyan-700',
      RECEIVED: 'bg-blue-700 hover:bg-blue-800',
      AWAITING_DEPOSIT: 'bg-yellow-500 hover:bg-yellow-600',
      PARTS_ORDERED: 'bg-purple-600 hover:bg-purple-700',
      PARTS_ARRIVED: 'bg-purple-700 hover:bg-purple-800',
      IN_REPAIR: 'bg-orange-600 hover:bg-orange-700',
      DELAYED: 'bg-red-600 hover:bg-red-700',
      READY_TO_COLLECT: 'bg-green-600 hover:bg-green-700',
      COLLECTED: 'bg-green-700 hover:bg-green-800',
      COMPLETED: 'bg-gray-600 hover:bg-gray-700',
      CANCELLED: 'bg-gray-800 hover:bg-gray-900',
    }
    return colors[status]
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Quick Actions</h2>
            <p className="text-xs text-gray-600 mt-1">
              <span className="font-bold">{jobRef}</span> - {deviceInfo}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Status */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-500 mb-1">Current Status</p>
          <p className="text-sm font-bold text-gray-900">{JOB_STATUS_LABELS[currentStatus]}</p>
        </div>

        {!showDeleteConfirm ? (
          <>
            {/* Status Grid */}
            <p className="text-sm font-bold text-gray-700 mb-2">Change Status</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {statuses.map((status) => (
                <button
                  key={status}
                  onClick={() => onSelectStatus(status)}
                  disabled={status === currentStatus}
                  className={`${getStatusColor(status)} text-white font-bold py-3 px-2 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 h-14 flex items-center justify-center text-center leading-tight`}
                >
                  {JOB_STATUS_LABELS[status]}
                </button>
              ))}
            </div>

            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 border-2 border-red-200"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Job</span>
            </button>
          </>
        ) : (
          <>
            {/* Delete Confirmation */}
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
              <p className="text-red-900 font-bold mb-2">Delete this job?</p>
              <p className="text-sm text-red-700">
                This will permanently delete <span className="font-bold">{jobRef}</span> ({deviceInfo}). This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-4 px-6 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
