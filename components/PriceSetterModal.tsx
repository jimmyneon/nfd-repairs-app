'use client'

import { useState } from 'react'
import { PoundSterling, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import SlideUpPanel from './SlideUpPanel'
import { createClient } from '@/lib/supabase-browser'

interface PriceSetterModalProps {
  jobId: string
  currentPrice: number
  paymentReceived?: boolean
  depositRequired?: boolean
  depositReceived?: boolean
  depositAmount?: number | null
  onClose: () => void
  onSaved: () => void
}

export default function PriceSetterModal({
  jobId, currentPrice, paymentReceived = false,
  depositRequired = false, depositReceived = false, depositAmount = null,
  onClose, onSaved,
}: PriceSetterModalProps) {
  const [price, setPrice] = useState(currentPrice.toString())
  const [payLoading, setPayLoading] = useState(false)
  const [isPaid, setIsPaid] = useState(paymentReceived)
  const supabase = createClient()
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

  const handleTogglePaid = async () => {
    setPayLoading(true)
    const newValue = !isPaid
    try {
      await supabase.from('jobs').update({ payment_received: newValue }).eq('id', jobId)
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'NOTE',
        message: newValue
          ? `Payment of £${currentPrice.toFixed(2)} marked as received`
          : 'Payment status reset to unpaid',
      })
      setIsPaid(newValue)
      onSaved()
    } catch (err) {
      console.error('Error updating payment status:', err)
    } finally {
      setPayLoading(false)
    }
  }

  const canMarkPaid = currentPrice > 0 && (!depositRequired || depositReceived)
  const balance = depositReceived ? currentPrice - (depositAmount || 0) : currentPrice

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

        {/* Payment Status */}
        {canMarkPaid && (
          <div className={`rounded-xl p-4 border-2 transition-colors ${
            isPaid
              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
              : 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPaid ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-orange-600" />
                )}
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                  {isPaid ? 'Payment Received' : 'Payment Outstanding'}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {isPaid ? '£' + currentPrice.toFixed(2) : '£' + balance.toFixed(2) + ' due'}
              </span>
            </div>
            <button
              onClick={handleTogglePaid}
              disabled={payLoading}
              className={`w-full mt-3 font-bold py-2.5 px-4 rounded-lg text-sm disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isPaid
                  ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {payLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
            </button>
          </div>
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
