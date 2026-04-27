'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { MessageSquare, Save, X } from 'lucide-react'

interface CustomerNotesEditorProps {
  job: Job
  onUpdate: () => void
}

export default function CustomerNotesEditor({ job, onUpdate }: CustomerNotesEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [notes, setNotes] = useState(job.customer_notes || '')
  const [saving, setSaving] = useState(false)
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
    setIsEditing(false)
    onUpdate()
  }

  const handleCancel = () => {
    setNotes(job.customer_notes || '')
    setIsEditing(false)
  }

  return (
    <div className="card bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800">
      <h2 className="text-lg font-bold text-blue-900 dark:text-blue-300 mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        Customer-Visible Notes
      </h2>
      
      <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
        These notes appear on the customer tracking page without changing the job status.
      </p>

      {!isEditing ? (
        <div>
          {job.customer_notes ? (
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mb-3">
              <p className="text-sm text-blue-900 dark:text-blue-200 whitespace-pre-wrap">{job.customer_notes}</p>
            </div>
          ) : (
            <p className="text-sm text-blue-600 dark:text-blue-400 italic mb-3">No customer notes</p>
          )}
          
          <button
            onClick={() => setIsEditing(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            {job.customer_notes ? 'Edit Notes' : 'Add Notes'}
          </button>
        </div>
      ) : (
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-blue-300 dark:border-blue-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
            placeholder="Enter notes that will be visible to the customer on their tracking page..."
          />
          
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-bold py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
