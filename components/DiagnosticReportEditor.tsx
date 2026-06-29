'use client'

import { useState } from 'react'
import { Save, FileText, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'

interface DiagnosticReportEditorProps {
  job: Job
  onUpdate?: () => void
}

export default function DiagnosticReportEditor({ job, onUpdate }: DiagnosticReportEditorProps) {
  const [report, setReport] = useState(job.diagnostic_report || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      await supabase
        .from('jobs')
        .update({ diagnostic_report: report.trim() || null })
        .eq('id', job.id)

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: report.trim()
          ? `Diagnostic report updated: "${report.trim().substring(0, 80)}${report.length > 80 ? '...' : ''}"`
          : 'Diagnostic report cleared',
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdate?.()
    } catch (error) {
      console.error('Failed to save diagnostic report:', error)
    }

    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <FileText className="h-4 w-4" />
        <span>Findings from examining the device. Will be available as a quick-insert in the SMS composer.</span>
      </div>

      <textarea
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="Enter diagnostic findings here...&#10;&#10;e.g. Screen is cracked, LCD still functional. Battery health at 72%. Charging port needs replacement. No water damage detected."
        rows={8}
        className="w-full p-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{report.length} characters</p>
        <button
          onClick={handleSave}
          disabled={saving || (report.trim() === (job.diagnostic_report || '').trim())}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saved ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <span>Saved!</span>
            </>
          ) : saving ? (
            <span>Saving...</span>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Report</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
