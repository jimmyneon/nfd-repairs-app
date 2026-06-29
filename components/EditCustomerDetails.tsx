'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Edit, Check, X, Loader2, User, Phone, Mail } from 'lucide-react'
import { Job } from '@/lib/types-v3'

interface EditCustomerDetailsProps {
  job: Job
  onUpdate: () => void
}

export default function EditCustomerDetails({ job, onUpdate }: EditCustomerDetailsProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(job.customer_name)
  const [phone, setPhone] = useState(job.customer_phone)
  const [email, setEmail] = useState(job.customer_email || '')
  const supabase = createClient()

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: email.trim() || null,
        })
        .eq('id', job.id)

      if (error) {
        alert(`Failed to update: ${error.message}`)
      } else {
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: 'Customer contact details updated by staff',
        })
        setEditing(false)
        onUpdate()
      }
    } catch (err) {
      alert('Failed to update customer details')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setName(job.customer_name)
    setPhone(job.customer_phone)
    setEmail(job.customer_email || '')
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-dark font-medium transition-colors"
      >
        <Edit className="h-3.5 w-3.5" />
        Edit Contact Details
      </button>
    )
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100">Edit Contact Details</h3>
        <button
          onClick={handleCancel}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
          <User className="h-3 w-3 inline mr-1" /> Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
          <Phone className="h-3 w-3 inline mr-1" /> Phone
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
          <Mail className="h-3 w-3 inline mr-1" /> Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="(optional)"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim() || !phone.trim()}
        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Check className="h-4 w-4" />
            Save Changes
          </>
        )}
      </button>
    </div>
  )
}
