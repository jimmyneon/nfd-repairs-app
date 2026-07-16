'use client'

import { User, X } from 'lucide-react'

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
    <div className="bg-green-600 text-white rounded-xl p-3 mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <User className="h-4 w-4 flex-shrink-0" />
        <span className="font-bold text-sm">Customer is here</span>
        <span className="text-xs text-white/70">{jobRef}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-white text-green-600 rounded-lg font-bold text-xs hover:bg-green-50 transition-colors"
        >
          Collect
        </button>
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
