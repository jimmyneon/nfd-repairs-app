'use client'

import { AlertCircle, ArrowUp, X } from 'lucide-react'

interface FormErrorToastProps {
  errors: Record<string, string>
  show: boolean
  onClose: () => void
}

export default function FormErrorToast({ errors, show, onClose }: FormErrorToastProps) {
  const errorList = Object.entries(errors)

  if (!show || errorList.length === 0) return null

  const goToField = (field: string) => {
    const element = document.querySelector(`[name="${field}"]`) as HTMLElement | null
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => element?.focus(), 350)
  }

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
            <ul className="space-y-1">
              {errorList.map(([field, message]) => (
                <li key={field}>
                  <button type="button" onClick={() => goToField(field)} className="text-left text-xs text-white leading-snug underline underline-offset-2 flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    {message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-white/70 hover:text-white p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
