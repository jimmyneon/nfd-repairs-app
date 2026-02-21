'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { SMSTemplate } from '@/lib/types'
import { SMS_TEMPLATE_VARIABLES } from '@/lib/constants'
import { ArrowLeft, Save, Plus, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<SMSTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ key: '', body: '', is_active: true })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('sms_templates')
      .select('*')
      .order('key')

    if (!error && data) {
      setTemplates(data)
    }
    setLoading(false)
  }

  const startEdit = (template: SMSTemplate) => {
    setEditingId(template.id)
    setEditForm({
      key: template.key,
      body: template.body,
      is_active: template.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ key: '', body: '', is_active: true })
  }

  const saveTemplate = async (id: string) => {
    setSaving(true)

    const { error } = await supabase
      .from('sms_templates')
      .update({
        body: editForm.body,
        is_active: editForm.is_active,
      })
      .eq('id', id)

    if (!error) {
      await loadTemplates()
      cancelEdit()
    }

    setSaving(false)
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    await supabase
      .from('sms_templates')
      .update({ is_active: !currentStatus })
      .eq('id', id)

    await loadTemplates()
  }

  const insertVariable = (variable: string) => {
    if (editingId) {
      setEditForm(prev => ({
        ...prev,
        body: prev.body + variable,
      }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Jobs
          </Link>
          <h1 className="text-xl font-bold text-gray-900">SMS Templates</h1>
          <p className="text-sm text-gray-600">Manage customer notification templates</p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="card bg-blue-50 border border-blue-200">
          <h2 className="font-semibold text-blue-900 mb-2">Available Variables</h2>
          <div className="flex flex-wrap gap-2">
            {SMS_TEMPLATE_VARIABLES.map((variable) => (
              <button
                key={variable}
                onClick={() => insertVariable(variable)}
                disabled={!editingId}
                className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono disabled:opacity-50"
              >
                {variable}
              </button>
            ))}
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Click a variable to insert it into the template you're editing
          </p>
        </div>

        {templates.map((template) => (
          <div key={template.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{template.key}</h3>
                <p className="text-xs text-gray-500">
                  Last updated: {new Date(template.updated_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <button
                onClick={() => toggleActive(template.id, template.is_active)}
                className={`p-2 rounded-lg ${
                  template.is_active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {template.is_active ? (
                  <Eye className="h-5 w-5" />
                ) : (
                  <EyeOff className="h-5 w-5" />
                )}
              </button>
            </div>

            {editingId === template.id ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message Template
                  </label>
                  <textarea
                    value={editForm.body}
                    onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    placeholder="Enter your SMS template..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Character count: {editForm.body.length} (SMS limit: 160)
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`active-${template.id}`}
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor={`active-${template.id}`} className="text-sm text-gray-700">
                    Active
                  </label>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => saveTemplate(template.id)}
                    disabled={saving}
                    className="flex-1 btn-primary disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 mr-2 inline" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{template.body}</p>
                </div>
                <button
                  onClick={() => startEdit(template)}
                  className="w-full bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark"
                >
                  Edit Template
                </button>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  )
}
