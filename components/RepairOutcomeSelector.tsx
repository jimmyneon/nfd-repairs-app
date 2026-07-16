'use client'

import { CheckCircle, XCircle } from 'lucide-react'

interface RepairOutcomeSelectorProps {
  value: 'repaired' | 'unrepaired'
  onChange: (v: 'repaired' | 'unrepaired') => void
}

export default function RepairOutcomeSelector({ value, onChange }: RepairOutcomeSelectorProps) {
  const options = [
    { value: 'repaired' as const, label: 'Fixed', icon: CheckCircle },
    { value: 'unrepaired' as const, label: 'Not Fixed', icon: XCircle },
  ]

  return (
    <div className="mb-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Repair Outcome</p>
      <div className="flex gap-2">
        {options.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-xl transition-all ${
                value === opt.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-bold">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
