'use client'

import { useEffect, useState } from 'react'
import { Job } from '@/lib/types-v3'
import { DiagnosticReport } from '@/lib/diagnostic-reports'

interface Props { job: Job; onUpdate?: () => void; onSendMessage?: (report: string) => void }

export default function DiagnosticReportEditor({ job, onUpdate, onSendMessage }: Props) {
  const [report, setReport] = useState<DiagnosticReport>({ title: 'Diagnostic Report', report_text: job.diagnostic_report || '', conclusion: '', recommendations: '', outcome: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [versions, setVersions] = useState(0)
  const [published, setPublished] = useState<DiagnosticReport | null>(null)
  const [migrationReady, setMigrationReady] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/jobs/diagnostic-reports?jobId=${encodeURIComponent(job.id)}`, { cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error('Reports could not be loaded. Close and reopen this panel to retry.'); return res.json() })
      .then(data => {
        if (!active) return
        setMigrationReady(data.migrationReady !== false)
        setReport(data.draft || data.published || { title: 'Diagnostic Report', report_text: data.legacyDraft || job.diagnostic_report || '', conclusion: '', recommendations: '', outcome: '' })
        setVersions(data.versions)
        setPublished(data.published)
      }).catch(e => { if (active) { setError(e.message); setLoadFailed(true) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [job.id]) // Existing private report is imported only if no versioned report exists.

  async function save(action: 'draft' | 'publish') {
    setSaving(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/jobs/diagnostic-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...report, jobId: job.id, action }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Report could not be saved.')
      setMessage(data.legacyDraft ? 'Private findings saved. Apply the database migration to save all report sections and publish.' : action === 'publish' ? 'Published — available on customer tracking now.' : 'Draft saved — private to staff. The last published version remains available.')
      if (action === 'publish') { setVersions(v => v + 1); setPublished(report) }
      onUpdate?.()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }
  if (loading) return <p>Loading diagnostic report…</p>
  const fields = [['title', 'Report title'], ['report_text', 'Diagnostic findings'], ['conclusion', 'Technician’s conclusion'], ['recommendations', 'Recommendations'], ['outcome', 'Repair outcome']] as const
  return <div className="space-y-4">
    <p className="text-sm text-gray-600 dark:text-gray-300">Drafts are private. Publish only customer-facing findings. Internal technician notes are kept separately.</p>
    <p className="text-sm font-semibold">{versions ? `${versions} published version(s) retained` : 'No published report yet'}</p>
    {!migrationReady && <p role="status" className="text-amber-700">Database setup is pending. You can still save private findings; publishing and the other report sections will be available after the migration.</p>}
    {fields.map(([key, label]) => <label key={key} className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{label}
      <textarea disabled={saving || loadFailed || (!migrationReady && key !== 'report_text')} rows={key === 'report_text' ? 8 : key === 'title' ? 1 : 3} maxLength={key === 'title' ? 200 : 50000} value={report[key]}
        onChange={e => setReport(r => ({ ...r, [key]: e.target.value }))}
        className="mt-1 w-full p-3 rounded-lg border border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-white" />
    </label>)}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {message && <p role="status" className="text-primary">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={saving || loadFailed || !report.report_text.trim()} onClick={() => save('draft')} className="px-4 py-3 rounded-lg border font-semibold disabled:opacity-50">Save Draft</button>
      <button disabled={saving || loadFailed || !migrationReady || !report.report_text.trim()} onClick={() => save('publish')} className="px-4 py-3 rounded-lg bg-primary text-white font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Publish to Customer'}</button>
      {published && onSendMessage && <button onClick={() => onSendMessage(published.report_text)} className="px-4 py-3 rounded-lg border font-semibold">Send Published Findings by SMS</button>}
      {job.diagnostic_report && onSendMessage && <button onClick={() => onSendMessage(job.diagnostic_report!)} className="px-4 py-3 rounded-lg border font-semibold">Compose SMS from Saved Findings</button>}
      {published && <button onClick={async () => { await navigator.clipboard.writeText(`${published.title}\n\n${published.report_text}\n\nTrack your repair: ${window.location.origin}/t/${job.tracking_token}`); setMessage('Published findings and tracking link copied.') }} className="px-4 py-3 rounded-lg border font-semibold">Copy Report + Tracking Link</button>}
    </div>
  </div>
}
