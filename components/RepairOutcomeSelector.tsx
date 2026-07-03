'use client'

interface RepairOutcomeSelectorProps {
  value: 'repaired' | 'unrepaired'
  onChange: (v: 'repaired' | 'unrepaired') => void
}

export default function RepairOutcomeSelector({ value, onChange }: RepairOutcomeSelectorProps) {
  const options = [
    { value: 'repaired' as const, label: 'Fixed' },
    { value: 'unrepaired' as const, label: 'Not Fixed' },
  ]

  return (
    <div className="mb-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Repair Outcome</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center py-3 rounded-xl font-bold text-sm transition-all ${
              value === opt.value
                ? 'bg-primary text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === 'unrepaired' && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Review request will be skipped for this job.
        </p>
      )}
    </div>
  )
}
