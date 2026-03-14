'use client'

import { useEffect } from 'react'
import { CheckCircle } from 'lucide-react'

interface BookingConfirmationScreenProps {
  isOpen: boolean
  onClose: () => void
  jobRef?: string
}

export default function BookingConfirmationScreen({ 
  isOpen, 
  onClose,
  jobRef 
}: BookingConfirmationScreenProps) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose()
      }, 10000)
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            ✓ Repair Booked Successfully
          </h2>
          {jobRef && (
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Job Reference: <span className="font-bold text-primary">{jobRef}</span>
            </p>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 mb-6">
          <p className="text-gray-900 dark:text-white mb-4">
            <strong>You will receive a text message shortly</strong> with a repair tracking link.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            The technician will now explain the next steps.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95"
        >
          Done
        </button>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          Returning to job creation in 10 seconds...
        </p>
      </div>
    </div>
  )
}
