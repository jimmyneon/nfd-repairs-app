'use client'

import { useState } from 'react'
import { PoundSterling, RefreshCw } from 'lucide-react'
import SlideUpPanel from './SlideUpPanel'

interface PriceSetterModalProps {
  jobId: string
  currentPrice: number
  onClose: () => void
  onSaved: () => void
}

export default function PriceSetterModal({ jobId, currentPrice, onClose, onSaved }: PriceSetterModalProps) {
  const [price, setPrice] = useState(currentPrice.toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    const numPrice = parseFloat(price)
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid price')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_total: numPrice }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update price')
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update price')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideUpPanel
      isOpen={true}
      onClose={onClose}
      title="Set Price"
      icon={<PoundSterling className="h-5 w-5 text-primary" />}
      minHeight="50vh"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Total Price (£)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-4 py-3 text-2xl font-bold border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="0.00"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-3 px-4 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <PoundSterling className="h-5 w-5" />
            )}
            Save Price
          </button>
        </div>
      </div>
    </SlideUpPanel>
  )
}
