'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Flag, AlertTriangle, Star, User, X } from 'lucide-react'

interface CustomerFlagControlsProps {
  job: Job
  onUpdate: () => void
}

export default function CustomerFlagControls({ job, onUpdate }: CustomerFlagControlsProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<'sensitive' | 'awkward' | 'vip' | 'normal' | null>(job.customer_flag || null)
  const [flagNotes, setFlagNotes] = useState(job.customer_flag_notes || '')
  const [skipReview, setSkipReview] = useState(job.skip_review_request || false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const handleSave = async () => {
    setSaving(true)
    
    const { error } = await supabase
      .from('jobs')
      .update({
        customer_flag: selectedFlag,
        customer_flag_notes: flagNotes || null,
        skip_review_request: skipReview
      } as any)
      .eq('id', job.id)

    if (!error) {
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Customer flag updated to: ${selectedFlag || 'none'}. Review request: ${skipReview ? 'disabled' : 'enabled'}`
      } as any)
      
      onUpdate()
      setShowModal(false)
    }
    
    setSaving(false)
  }

  const getFlagIcon = (flag: string | null | undefined) => {
    switch (flag) {
      case 'sensitive':
        return <AlertTriangle className="h-4 w-4" />
      case 'awkward':
        return <AlertTriangle className="h-4 w-4" />
      case 'vip':
        return <Star className="h-4 w-4" />
      case 'normal':
        return <User className="h-4 w-4" />
      default:
        return <Flag className="h-4 w-4" />
    }
  }

  const getFlagColor = (flag: string | null | undefined) => {
    switch (flag) {
      case 'sensitive':
        return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
      case 'awkward':
        return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-300'
      case 'vip':
        return 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300'
      case 'normal':
        return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
      default:
        return 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-300'
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Customer Management</h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Customer Flag</p>
            <div className={`flex items-center gap-2 p-3 rounded-lg border-2 ${getFlagColor(job.customer_flag)}`}>
              {getFlagIcon(job.customer_flag)}
              <span className="text-sm font-bold uppercase">
                {job.customer_flag || 'No flag set'}
              </span>
            </div>
            {job.customer_flag_notes && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">
                Note: {job.customer_flag_notes}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Review Request</p>
            <div className={`flex items-center gap-2 p-3 rounded-lg border-2 ${
              job.skip_review_request 
                ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
            }`}>
              {job.skip_review_request ? (
                <>
                  <X className="h-4 w-4" />
                  <span className="text-sm font-bold">Review request DISABLED</span>
                </>
              ) : (
                <>
                  <Star className="h-4 w-4" />
                  <span className="text-sm font-bold">Review request enabled</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl transition-all"
          >
            Update Customer Settings
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Customer Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Customer Flag
                </label>
                <div className="space-y-2">
                  {[
                    { value: null, label: 'No Flag', desc: 'Normal customer' },
                    { value: 'normal', label: 'Normal', desc: 'Standard customer' },
                    { value: 'vip', label: 'VIP', desc: 'Important customer' },
                    { value: 'sensitive', label: 'Sensitive', desc: 'Handle with care - no review request' },
                    { value: 'awkward', label: 'Awkward', desc: 'Difficult customer - no review request' },
                  ].map((option) => (
                    <button
                      key={option.label}
                      onClick={() => setSelectedFlag(option.value as any)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedFlag === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="font-bold text-gray-900 dark:text-white">{option.label}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Flag Notes (Optional)
                </label>
                <textarea
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  placeholder="Why is this customer flagged?"
                  className="w-full p-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                />
              </div>

              <div>
                <label className="flex items-center gap-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={skipReview}
                    onChange={(e) => setSkipReview(e.target.checked)}
                    className="w-5 h-5 text-primary focus:ring-2 focus:ring-primary"
                  />
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">Disable Review Request</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Don't send post-collection review SMS to this customer
                    </div>
                  </div>
                </label>
              </div>

              {(selectedFlag === 'sensitive' || selectedFlag === 'awkward') && !skipReview && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-300 dark:border-yellow-700 p-3 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold">
                    ⚠️ Note: Review requests are automatically disabled for sensitive/awkward customers
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 bg-primary hover:bg-primary-dark text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
