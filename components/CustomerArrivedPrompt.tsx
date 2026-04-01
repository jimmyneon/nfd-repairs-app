'use client'

import { CheckCircle, X } from 'lucide-react'

interface CustomerArrivedPromptProps {
  jobRef: string
  onConfirm: () => void
  onDismiss: () => void
}

export default function CustomerArrivedPrompt({ 
  jobRef, 
  onConfirm, 
  onDismiss 
}: CustomerArrivedPromptProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Customer Arrived
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {jobRef}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <p className="text-gray-700 dark:text-gray-300 mb-6">
          The customer has confirmed they're at the shop. Would you like to mark this job as collected?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Not Yet
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors shadow-lg"
          >
            Mark as Collected
          </button>
        </div>
      </div>
    </div>
  )
}
