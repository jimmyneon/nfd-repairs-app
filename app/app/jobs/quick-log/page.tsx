'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Loader2, Zap } from 'lucide-react'
import { QUICK_REPAIR_DEVICES } from '@/lib/quick-repair-log'

export default function QuickRepairLogPage() {
  const [device, setDevice] = useState('')
  const [model, setModel] = useState('')
  const [issue, setIssue] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('COMPLETED')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<{ id: string; job_ref: string } | null>(null)
  const requestId = useRef<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)
    try {
      requestId.current ||= crypto.randomUUID()
      const response = await fetch('/api/jobs/quick-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId.current, device_type: device, device_model: model, issue, amount, status }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save this repair.')
      setSaved(result)
    } catch (err) {
      setError((err as Error).message || 'Could not save this repair. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function logAnother() {
    setSaved(null)
    setDevice('')
    setModel('')
    setIssue('')
    setAmount('')
    setStatus('COMPLETED')
    setError('')
    requestId.current = null
  }

  const inputClass = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-lg space-y-5">
        <Link href="/app/jobs" className="inline-block py-2 text-sm font-semibold text-primary">← Repair jobs</Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><Zap className="h-6 w-6 text-primary" />Quick repair log</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Record a walk-in repair without customer details.</p>
        </div>
        {saved ? (
          <section className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm space-y-4" aria-live="polite">
            <CheckCircle className="h-10 w-10 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Repair saved · {saved.job_ref}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{status === 'COMPLETED' ? 'Added to job history and completed-job analytics.' : 'Added to your active jobs. You can add customer details later.'}</p>
            <button onClick={logAnother} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white">Log another repair</button>
            <Link href={`/app/jobs/${saved.id}`} className="block text-center py-2 font-semibold text-primary">View repair</Link>
          </section>
        ) : (
          <form onSubmit={save} className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm space-y-5">
            <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">Device type</label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Device type">
                  {QUICK_REPAIR_DEVICES.map(option => (
                    <button key={option.value} type="button" aria-pressed={device === option.value} onClick={() => setDevice(option.value)} className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold ${device === option.value ? 'border-primary bg-primary text-white' : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>{option.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="quick-model" className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">Model <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="quick-model" value={model} onChange={event => setModel(event.target.value)} maxLength={120} placeholder="e.g. iPhone 12" className={inputClass} />
              </div>
              <div>
                <label htmlFor="quick-issue" className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">Repair carried out / needed</label>
                <input id="quick-issue" required value={issue} onChange={event => setIssue(event.target.value)} maxLength={500} placeholder="e.g. Battery replacement" className={inputClass} />
              </div>
              <div>
                <label htmlFor="quick-amount" className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">Amount charged (£) <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="quick-amount" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 55" className={inputClass} />
              </div>
              <div>
                <label htmlFor="quick-status" className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">Repair status</label>
                <select id="quick-status" value={status} onChange={event => setStatus(event.target.value)} className={inputClass}>
                  <option value="COMPLETED">Finished and returned to customer</option>
                  <option value="RECEIVED">Still in progress / device in shop</option>
                </select>
              </div>
            </fieldset>
            {error && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={saving || !device || !issue.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 font-bold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-5 w-5 animate-spin" />}{saving ? 'Saving…' : 'Save repair'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
