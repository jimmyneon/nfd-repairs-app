'use client'

import { X } from 'lucide-react'
import { JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS } from '@/lib/constants'

interface StatusSelectorModalProps {
  currentStatus: JobStatus
  onSelect: (status: JobStatus) => void
  onClose: () => void
}

export default function StatusSelectorModal({
  currentStatus,
  onSelect,
  onClose
}: StatusSelectorModalProps) {
  const statuses: JobStatus[] = [
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'READY_TO_BOOK_IN',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COMPLETED',
    'CANCELLED'
  ]

  const getStatusColor = (status: JobStatus) => {
    const colors: Record<JobStatus, string> = {
      RECEIVED: 'bg-blue-600 hover:bg-blue-700',
      AWAITING_DEPOSIT: 'bg-yellow-500 hover:bg-yellow-600',
      PARTS_ORDERED: 'bg-purple-600 hover:bg-purple-700',
      PARTS_ARRIVED: 'bg-purple-700 hover:bg-purple-800',
      READY_TO_BOOK_IN: 'bg-indigo-600 hover:bg-indigo-700',
      IN_REPAIR: 'bg-orange-600 hover:bg-orange-700',
      DELAYED: 'bg-amber-600 hover:bg-amber-700',
      READY_TO_COLLECT: 'bg-green-600 hover:bg-green-700',
      COMPLETED: 'bg-gray-700 hover:bg-gray-800',
      CANCELLED: 'bg-red-600 hover:bg-red-700',
    }
    return colors[status]
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-gray-900">Change Status</h2>
            <p className="text-xs text-gray-600 mt-1">
              Current: <span className="font-bold">{JOB_STATUS_LABELS[currentStatus]}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Grid - Smaller buttons to fit all without scrolling */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => onSelect(status)}
              disabled={status === currentStatus}
              className={`${getStatusColor(status)} text-white font-bold py-3 px-2 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 h-16 flex items-center justify-center text-center leading-tight`}
            >
              {JOB_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <button
          onClick={onClose}
          className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-xl text-base transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
