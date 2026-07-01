'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Home, Save, Eye, EyeOff, Code, Mail, X } from 'lucide-react'
import Link from 'next/link'
import SlideUpPanel from '@/components/SlideUpPanel'

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
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBodyHtml, setEditBodyHtml] = useState('')
  const [editBodyText, setEditBodyText] = useState('')
  const [editActive, setEditActive] = useState(true)
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
    setEditingTemplate(template)
    setEditSubject(template.subject)
    setEditBodyHtml(template.body_html)
    setEditBodyText(template.body_text)
    setEditActive(template.is_active)
  }

  const cancelEdit = () => {
    setEditingTemplate(null)
    setEditSubject('')
    setEditBodyHtml('')
    setEditBodyText('')
    setEditActive(true)
    setShowPreview(false)
  }

  const saveTemplate = async () => {
    if (!editingTemplate) return
    setSaving(true)

    const { error } = await supabase
      .from('email_templates')
      .update({
        subject: editSubject,
        body_html: editBodyHtml,
        body_text: editBodyText,
        is_active: editActive,
      } as any)
      .eq('id', editingTemplate.id)

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
    if (activeField === 'subject') {
      setEditSubject(prev => prev + variable)
    } else if (activeField === 'html') {
      setEditBodyHtml(prev => prev + variable)
    } else {
      setEditBodyText(prev => prev + variable)
    }
    setShowVariableModal(false)
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
          <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-3">
            <Home className="h-5 w-5 text-primary" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Email Templates</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Manage HTML email templates for status updates</p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {templates.map((template) => (
          <div key={template.id} className="card dark:bg-gray-800">
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
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {template.is_active ? (
                  <Eye className="h-5 w-5" />
                ) : (
                  <EyeOff className="h-5 w-5" />
                )}
              </button>
            </div>

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
        ))}
      </main>

      {/* Edit Slide-Up Panel */}
      <SlideUpPanel
        isOpen={!!editingTemplate}
        onClose={cancelEdit}
        title={editingTemplate ? `Edit: ${editingTemplate.status_key}` : 'Edit Template'}
        icon={<Mail className="h-5 w-5 text-primary" />}
        minHeight="70vh"
      >
        {editingTemplate && (
          <div className="space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Subject
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  onFocus={() => setActiveField('subject')}
                  className="w-full px-3 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
              <textarea
                value={editBodyHtml}
                onChange={(e) => setEditBodyHtml(e.target.value)}
                onFocus={() => setActiveField('html')}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                placeholder="<h2>Your HTML content...</h2>"
              />
              <button
                type="button"
                onClick={() => setShowVariableModal(true)}
                className="mt-1 bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
              >
                + Insert Variable
              </button>
            </div>

            {/* Plain Text Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Plain Text Body (fallback)
              </label>
              <textarea
                value={editBodyText}
                onChange={(e) => setEditBodyText(e.target.value)}
                onFocus={() => setActiveField('text')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Plain text version..."
              />
              <button
                type="button"
                onClick={() => setShowVariableModal(true)}
                className="mt-1 bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
              >
                + Var
              </button>
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
                  dangerouslySetInnerHTML={{ __html: editBodyHtml }}
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="edit-active" className="text-sm text-gray-700 dark:text-gray-300">
                Active
              </label>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={saveTemplate}
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
        )}
      </SlideUpPanel>

      {/* Variable Selection Modal */}
      {showVariableModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-gray-900 dark:text-white">Insert Variable</h2>
              <button onClick={() => setShowVariableModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Insert into {activeField === 'subject' ? 'subject' : activeField === 'html' ? 'HTML body' : 'text body'}:
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
          </div>
        </div>
      )}
    </div>
  )
}
