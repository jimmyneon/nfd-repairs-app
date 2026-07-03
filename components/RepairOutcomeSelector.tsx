'use client'

interface RepairOutcomeSelectorProps {
  value: 'repaired' | 'unrepaired' | 'partial' | 'warranty_claim'
  onChange: (v: 'repaired' | 'unrepaired' | 'partial' | 'warranty_claim') => void
}

const OPTIONS = [
  { value: 'repaired', label: 'Repaired', desc: 'Fixed OK' },
  { value: 'unrepaired', label: 'Not Fixed', desc: "Couldn't fix" },
  { value: 'partial', label: 'Partial', desc: 'Partially fixed' },
  { value: 'warranty_claim', label: 'Warranty', desc: 'Sent to warranty' },
] as const

export default function RepairOutcomeSelector({ value, onChange }: RepairOutcomeSelectorProps) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
      <p className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-3">Repair Outcome</p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`p-3 rounded-lg text-left transition-all border-2 ${
              value === opt.value
                ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-amber-300'
            }`}
          >
            <p className="font-bold text-sm">{opt.label}</p>
            <p className={`text-xs ${value === opt.value ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{opt.desc}</p>
          </button>
        ))}
      </div>
      {value !== 'repaired' && (
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
          Review request will be skipped{value === 'partial' ? ' (aftercare still sent)' : ' and aftercare messages will be skipped'}.
        </p>
      )}
    </div>
  )
}
