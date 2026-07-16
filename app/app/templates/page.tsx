'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { SMSTemplate } from '@/lib/types'
import { SMS_TEMPLATE_VARIABLES } from '@/lib/constants'
import { Home, Save, Eye, EyeOff, MessageSquare, X, Plus } from 'lucide-react'
import Link from 'next/link'
import SlideUpPanel from '@/components/SlideUpPanel'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<SMSTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<SMSTemplate | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showVariableModal, setShowVariableModal] = useState(false)
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
    setEditingTemplate(template)
    setEditBody(template.body)
    setEditActive(template.is_active)
  }

  const cancelEdit = () => {
    setEditingTemplate(null)
    setEditBody('')
    setEditActive(true)
  }

  const saveTemplate = async () => {
    if (!editingTemplate) return
    setSaving(true)

    const { error } = await supabase
      .from('sms_templates')
      .update({
        body: editBody,
        is_active: editActive,
      })
      .eq('id', editingTemplate.id)

    if (!error) {
      await loadTemplates()
      cancelEdit()
    }

    setSaving(false)
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    await supabase
      .from('sms_templates')
      .update({ is_active: !currentStatus } as any)
      .eq('id', id)

    await loadTemplates()
  }

  const insertVariable = (variable: string) => {
    setEditBody(prev => prev + variable)
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
          <div className="flex items-center gap-2 mb-3">
            <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
              <Home className="h-5 w-5 text-primary" />
            </Link>
            <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
              <Plus className="h-5 w-5 text-primary" />
            </Link>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">SMS Templates</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Manage customer notification templates</p>
        </div>
      </header>

      <main className="p-4 space-y-4">

        {templates.map((template) => (
          <div key={template.id} className="card dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">{template.key}</h3>
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

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">{template.body}</p>
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
        title={editingTemplate ? `Edit: ${editingTemplate.key}` : 'Edit Template'}
        icon={<MessageSquare className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        {editingTemplate && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Message Template
              </label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter your SMS template..."
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {editBody.length} chars
                </p>
                <button
                  type="button"
                  onClick={() => setShowVariableModal(true)}
                  className="bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark"
                >
                  + Insert Variable
                </button>
              </div>
            </div>

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
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Tap a variable to insert:</p>
            
            <div className="space-y-2">
              {SMS_TEMPLATE_VARIABLES.map((variable) => (
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
