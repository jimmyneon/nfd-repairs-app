'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

interface FormErrorToastProps {
  errors: Record<string, string>
  show: boolean
  onClose: () => void
}

export default function FormErrorToast({ errors, show, onClose }: FormErrorToastProps) {
  const [visible, setVisible] = useState(false)
  const errorList = Object.values(errors)

  useEffect(() => {
    if (show && errorList.length > 0) {
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [show, errorList.length])

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        setVisible(false)
        onClose()
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [visible, onClose])

  if (!visible || errorList.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto bg-red-600 text-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up">
        <div className="flex items-start gap-3 p-4">
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm mb-1">
              {errorList.length === 1 ? '1 field needs attention' : `${errorList.length} fields need attention`}
            </p>
            <ul className="space-y-0.5">
              {errorList.map((msg, i) => (
                <li key={i} className="text-xs text-white/90 leading-snug">
                  {msg}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => { setVisible(false); onClose() }}
            className="flex-shrink-0 text-white/70 hover:text-white p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 bg-white/20">
          <div className="h-full bg-white/40 animate-toast-progress" />
        </div>
      </div>
    </div>
  )
}
