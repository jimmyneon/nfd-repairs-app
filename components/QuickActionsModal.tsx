'use client'

import { X, Trash2, CheckCircle, Package, Clock, Wrench, AlertTriangle, Bell, UserCheck, Archive, Ban, FileText } from 'lucide-react'
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
    'DIAGNOSTIC',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'IN_STORAGE',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED',
  ]

  const getStatusColor = (status: JobStatus) => {
    const colors: Record<JobStatus, string> = {
      QUOTE_APPROVED: 'bg-cyan-600 hover:bg-cyan-700',
      RECEIVED: 'bg-blue-700 hover:bg-blue-800',
      DIAGNOSTIC: 'bg-indigo-600 hover:bg-indigo-700',
      AWAITING_DEPOSIT: 'bg-yellow-500 hover:bg-yellow-600',
      PARTS_ORDERED: 'bg-purple-600 hover:bg-purple-700',
      PARTS_ARRIVED: 'bg-purple-700 hover:bg-purple-800',
      IN_REPAIR: 'bg-orange-600 hover:bg-orange-700',
      DELAYED: 'bg-red-600 hover:bg-red-700',
      READY_TO_COLLECT: 'bg-green-600 hover:bg-green-700',
      IN_STORAGE: 'bg-amber-700 hover:bg-amber-800',
      COLLECTED: 'bg-green-700 hover:bg-green-800',
      COMPLETED: 'bg-gray-600 hover:bg-gray-700',
      CANCELLED: 'bg-gray-800 hover:bg-gray-900',
    }
    return colors[status]
  }

  const getStatusIcon = (status: JobStatus) => {
    const icons: Record<JobStatus, typeof CheckCircle> = {
      QUOTE_APPROVED: FileText,
      RECEIVED: Package,
      DIAGNOSTIC: FileText,
      AWAITING_DEPOSIT: Clock,
      PARTS_ORDERED: Package,
      PARTS_ARRIVED: CheckCircle,
      IN_REPAIR: Wrench,
      DELAYED: AlertTriangle,
      READY_TO_COLLECT: Bell,
      IN_STORAGE: Archive,
      COLLECTED: UserCheck,
      COMPLETED: Archive,
      CANCELLED: Ban,
    }
    return icons[status]
  }

  const getShortLabel = (status: JobStatus) => {
    const shortLabels: Record<JobStatus, string> = {
      QUOTE_APPROVED: 'Approved',
      RECEIVED: 'Received',
      DIAGNOSTIC: 'Diag',
      AWAITING_DEPOSIT: 'Deposit',
      PARTS_ORDERED: 'Parts',
      PARTS_ARRIVED: 'Arrived',
      IN_REPAIR: 'Repair',
      DELAYED: 'Delayed',
      READY_TO_COLLECT: 'Collect',
      IN_STORAGE: 'Storage',
      COLLECTED: 'Collected',
      COMPLETED: 'Done',
      CANCELLED: 'Cancel',
    }
    return shortLabels[status]
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Quick Actions</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span className="font-bold">{jobRef}</span> - {deviceInfo}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Status */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Status</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white">{JOB_STATUS_LABELS[currentStatus]}</p>
        </div>

        {!showDeleteConfirm ? (
          <>
            {/* Status Grid - 3 columns of square buttons */}
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Change Status</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {statuses.map((status) => {
                const Icon = getStatusIcon(status)
                const isCurrent = status === currentStatus
                return (
                  <button
                    key={status}
                    onClick={() => onSelectStatus(status)}
                    disabled={isCurrent}
                    className={`${getStatusColor(status)} text-white font-bold rounded-xl text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 aspect-square flex flex-col items-center justify-center gap-1.5`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="leading-tight text-center">{getShortLabel(status)}</span>
                  </button>
                )
              })}
            </div>

            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 border-2 border-red-200 dark:border-red-800"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Job</span>
            </button>
          </>
        ) : (
          <>
            {/* Delete Confirmation */}
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
              <p className="text-red-900 dark:text-red-100 font-bold mb-2">Delete this job?</p>
              <p className="text-sm text-red-700 dark:text-red-300">
                This will permanently delete <span className="font-bold">{jobRef}</span> ({deviceInfo}). This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-colors"
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
