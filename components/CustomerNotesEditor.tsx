'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Save, Trash2 } from 'lucide-react'

interface CustomerNotesEditorProps {
  job: Job
  onUpdate: () => void
}

export default function CustomerNotesEditor({ job, onUpdate }: CustomerNotesEditorProps) {
  const [notes, setNotes] = useState(job.customer_notes || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  const handleSave = async () => {
    setSaving(true)
    
    await supabase
      .from('jobs')
      .update({ customer_notes: notes || null })
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'NOTE',
      message: notes ? `Customer notes updated: ${notes}` : 'Customer notes cleared',
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdate()
  }

  const handleClear = async () => {
    setNotes('')
    setSaving(true)
    
    await supabase
      .from('jobs')
      .update({ customer_notes: null })
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'NOTE',
      message: 'Customer notes cleared',
    })

    setSaving(false)
    onUpdate()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        These notes appear on the customer tracking page without changing the job status.
      </p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={6}
        autoFocus
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
        placeholder="Enter notes that will be visible to the customer on their tracking page..."
      />

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Notes'}
        </button>
        {notes && (
          <button
            onClick={handleClear}
            disabled={saving}
            className="px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-100 dark:hover:bg-red-900/50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
