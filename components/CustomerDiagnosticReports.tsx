'use client'

import { useCallback, useEffect, useState } from 'react'
import { DiagnosticReport, reportSections } from '@/lib/diagnostic-reports'

export default function CustomerDiagnosticReports({ endpoint }: { endpoint: string }) {
  const [reports, setReports] = useState<DiagnosticReport[]>([])
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'Your access has expired. Please contact us for a fresh link.' : 'Reports could not be loaded. Please try again.')
      setReports((await res.json()).reports || [])
      setError('')
    } catch (e) { setError((e as Error).message) }
  }, [endpoint])
  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  async function download(report: DiagnosticReport) {
    setDownloading(true)
    try {
      const res = await fetch(`${endpoint}?report=${encodeURIComponent(report.id || '')}&download=1`, { cache: 'no-store' })
      if (!res.ok || !res.headers.get('Content-Type')?.includes('application/pdf')) throw new Error('Download failed. Please try again, or contact us for a copy.')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'NFD-diagnostic-report.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setDownloading(false) }
  }

  if (!reports.length && !error) return null
  return <section aria-label="Diagnostic Report" className="rounded-2xl bg-white dark:bg-gray-800 border border-primary/30 p-5 md:p-6 shadow-sm space-y-5">
    <h2 className="text-xl font-bold text-primary">Diagnostic Report</h2>
    {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error} <button onClick={load} className="underline font-semibold">Retry</button></div>}
    {reports.map(report => <article key={report.id} className="space-y-4 break-words">
      <h3 className="font-bold text-lg text-gray-900 dark:text-white">{report.title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {report.device}{report.job_ref && ` · ${report.job_ref}`}<br />
        Published: {report.published_at ? new Date(report.published_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : 'Date not recorded'}
      </p>
      {reportSections(report).map(([label, text]) => <div key={label}>
        <h4 className="font-semibold text-gray-900 dark:text-white">{label}</h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200 mt-1">{text}</p>
      </div>)}
      <button disabled={downloading} onClick={() => download(report)} className="w-full sm:w-auto rounded-xl px-5 py-3 bg-primary text-white font-bold disabled:opacity-50">
        {downloading ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      <p className="text-xs text-gray-500 dark:text-gray-400">Your published report stays available here after collection.</p>
    </article>)}
  </section>
}
