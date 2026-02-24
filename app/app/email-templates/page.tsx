'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Save, Eye, EyeOff, Code } from 'lucide-react'
import Link from 'next/link'

interface EmailTemplate {
  id: string
  status_key: string
  subject: string
  body_html: string
  body_text: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const EMAIL_TEMPLATE_VARIABLES = [
  '{job_ref}',
  '{device_make}',
  '{device_model}',
  '{tracking_link}',
  '{deposit_link}',
]

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ 
    status_key: '', 
    subject: '', 
    body_html: '', 
    body_text: '', 
    is_active: true 
  })
  const [saving, setSaving] = useState(false)
  const [showVariableModal, setShowVariableModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [activeField, setActiveField] = useState<'subject' | 'html' | 'text'>('html')
  const supabase = createClient()

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('status_key')

    if (!error && data) {
      setTemplates(data)
    }
    setLoading(false)
  }

  const startEdit = (template: EmailTemplate) => {
    setEditingId(template.id)
    setEditForm({
      status_key: template.status_key,
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text,
      is_active: template.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ status_key: '', subject: '', body_html: '', body_text: '', is_active: true })
    setShowPreview(false)
  }

  const saveTemplate = async (id: string) => {
    setSaving(true)

    const { error } = await supabase
      .from('email_templates')
      .update({
        subject: editForm.subject,
        body_html: editForm.body_html,
        body_text: editForm.body_text,
        is_active: editForm.is_active,
      } as any)
      .eq('id', id)

    if (!error) {
      await loadTemplates()
      cancelEdit()
    }

    setSaving(false)
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    await supabase
      .from('email_templates')
      .update({ is_active: !currentStatus } as any)
      .eq('id', id)

    await loadTemplates()
  }

  const insertVariable = (variable: string) => {
    if (editingId) {
      if (activeField === 'subject') {
        setEditForm(prev => ({ ...prev, subject: prev.subject + variable }))
      } else if (activeField === 'html') {
        setEditForm(prev => ({ ...prev, body_html: prev.body_html + variable }))
      } else {
        setEditForm(prev => ({ ...prev, body_text: prev.body_text + variable }))
      }
      setShowVariableModal(false)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <Link href="/app/settings" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Settings
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Email Templates</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Manage HTML email templates for status updates</p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {templates.map((template) => (
          <div key={template.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">{template.status_key}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
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
                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Subject
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      onFocus={() => setActiveField('subject')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Email subject line..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowVariableModal(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
                    >
                      + Var
                    </button>
                  </div>
                </div>

                {/* HTML Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    HTML Body
                  </label>
                  <div className="relative">
                    <textarea
                      value={editForm.body_html}
                      onChange={(e) => setEditForm({ ...editForm, body_html: e.target.value })}
                      onFocus={() => setActiveField('html')}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                      placeholder="<h2>Your HTML content...</h2>"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVariableModal(true)}
                      className="absolute bottom-2 right-2 bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
                    >
                      + Insert Variable
                    </button>
                  </div>
                </div>

                {/* Plain Text Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Plain Text Body (fallback)
                  </label>
                  <div className="relative">
                    <textarea
                      value={editForm.body_text}
                      onChange={(e) => setEditForm({ ...editForm, body_text: e.target.value })}
                      onFocus={() => setActiveField('text')}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Plain text version..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowVariableModal(true)}
                      className="absolute bottom-2 right-2 bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
                    >
                      + Var
                    </button>
                  </div>
                </div>

                {/* Preview Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center"
                >
                  <Code className="h-4 w-4 mr-2" />
                  {showPreview ? 'Hide Preview' : 'Show HTML Preview'}
                </button>

                {showPreview && (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                    <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Preview:</h4>
                    <div 
                      className="prose dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: editForm.body_html }} 
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`active-${template.id}`}
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor={`active-${template.id}`} className="text-sm text-gray-700 dark:text-gray-300">
                    Active
                  </label>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => saveTemplate(template.id)}
                    disabled={saving}
                    className="flex-1 bg-primary text-white px-4 py-3 rounded-xl font-bold hover:bg-primary-dark disabled:opacity-50 shadow-md"
                  >
                    <Save className="h-5 w-5 mr-2 inline" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="space-y-2 mb-3">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Subject:</p>
                    <p className="text-sm text-gray-900 dark:text-white font-semibold">{template.subject}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">HTML Body:</p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap line-clamp-3">
                      {template.body_html}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => startEdit(template)}
                  className="w-full bg-primary text-white px-4 py-3 rounded-xl font-bold hover:bg-primary-dark shadow-md"
                >
                  Edit Template
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Variable Selection Modal */}
        {showVariableModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Insert Variable</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a variable to insert into {activeField === 'subject' ? 'subject' : activeField === 'html' ? 'HTML body' : 'text body'}:
              </p>
              
              <div className="space-y-2">
                {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    onClick={() => insertVariable(variable)}
                    className="w-full text-left bg-gray-50 dark:bg-gray-700 hover:bg-primary hover:text-white dark:hover:bg-primary px-4 py-3 rounded-xl font-mono text-sm font-bold transition-colors"
                  >
                    {variable}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowVariableModal(false)}
                className="w-full mt-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
