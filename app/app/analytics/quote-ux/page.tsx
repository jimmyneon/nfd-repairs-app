'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock3, HelpCircle, RefreshCw, Target } from 'lucide-react'

type Data = {
  success: boolean
  range: { start: string; end: string; timezone: string }
  instrumentation_active: boolean
  instrumentation_started_at: string | null
  visits: null | {
    started: number
    category_selected: number
    no_category_selection: number
    brand_selected: number
    model_selected: number
    repair_selected: number
    quote_reached: number
    submitted: number
    category_selected_while_loading: number
    category_loading_then_progressed: number
  }
  conversion?: null | {
    quote_reached: number
    repair_start_clicked: number
    repair_request_opened: number
    repair_request_submitted: number
    device_received: number
    not_ready_opened: number
    routes: Array<{
      mode: 'guided' | 'search' | 'deep_link' | 'restored' | 'unknown'
      visits: number
      quote_reached: number
      repair_start_clicked: number
      repair_request_submitted: number
      device_received: number
    }>
  }
  catalogue: null | {
    ready_events: number
    timeout_events: number
    avg_load_ms: number
    median_load_ms: number
    p90_load_ms: number
    avg_transfer_bytes: number
    avg_decoded_bytes: number
  }
  help: null | {
    model_help_opened: number
    model_unlisted: number
    repair_help_used: number
  }
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : '0%'
}

function ms(value: number) {
  if (!value) return '—'
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`
}

function bytes(value: number) {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function QuoteUxPage() {
  const [days, setDays] = useState('7')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/analytics/quote-ux?days=${days}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setData(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const started = data?.visits?.started || 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <header className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-5xl mx-auto p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/app/analytics" className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Back to quote analytics">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-bold text-lg">Quote UX diagnostics</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Separates loading friction from customer indecision.</p>
            </div>
          </div>
          <button onClick={load} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 pb-16 space-y-5">
        <div className="flex flex-wrap gap-2">
          {[['1', 'Today'], ['7', '7 days'], ['30', '30 days']].map(([value, label]) => (
            <button key={value} onClick={() => setDays(value)} className={`px-3 py-2 rounded-lg text-sm font-medium ${days === value ? 'bg-green-700 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>{label}</button>
          ))}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>}

        {loading && !data && <div className="py-20 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-green-700" /></div>}

        {data && !data.instrumentation_active && !loading && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold mb-2">No new UX signals yet</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">The detailed tracking starts from the new website deployment. Once visitors use the quote form, this page will show whether they waited for pricing, needed model help, or deliberately chose the manual repair route.</p>
          </div>
        )}

        {data?.visits && data.catalogue && data.help && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric title="Quote visits" value={data.visits.started} sub="New tracked visits" icon={<Target className="w-4 h-4" />} />
              <Metric title="No category click" value={data.visits.no_category_selection} sub={pct(data.visits.no_category_selection, started)} icon={<Target className="w-4 h-4" />} />
              <Metric title="Selected while loading" value={data.visits.category_selected_while_loading} sub={`${data.visits.category_loading_then_progressed} then reached brand`} icon={<Clock3 className="w-4 h-4" />} />
              <Metric title="Model help used" value={data.help.model_help_opened} sub={`${data.help.model_unlisted} used model not listed`} icon={<HelpCircle className="w-4 h-4" />} />
            </section>

            {data.conversion && (
              <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="font-semibold mb-1">Commercial funnel</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">The part that matters commercially: people who saw a quote, chose to start the repair, opened the request and submitted it. Search and deep-link visitors can skip the earlier selection steps.</p>
                <div className="space-y-3">
                  <Stage label="Quote reached" count={data.conversion.quote_reached} base={data.conversion.quote_reached} />
                  <Stage label="Get repair started" count={data.conversion.repair_start_clicked} base={data.conversion.quote_reached} />
                  <Stage label="Request opened" count={data.conversion.repair_request_opened} base={data.conversion.quote_reached} />
                  <Stage label="Repair request submitted" count={data.conversion.repair_request_submitted} base={data.conversion.quote_reached} />
                  <Stage label="Device actually arrived" count={data.conversion.device_received} base={data.conversion.quote_reached} />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Opened “Not ready yet?”</span>
                  <span className="font-semibold">{data.conversion.not_ready_opened} · {pct(data.conversion.not_ready_opened, data.conversion.quote_reached)}</span>
                </div>
              </section>
            )}

            {data.conversion && data.conversion.routes.length > 0 && (
              <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="font-semibold mb-1">Journey routes</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Search, guided selection and direct/deep links are measured separately so shortcuts no longer make the funnel look backwards.</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {data.conversion.routes.map(route => (
                    <div key={route.mode} className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="font-semibold capitalize">{route.mode.replace('_', ' ')}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{route.visits} visits</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <RouteStat label="Quotes" value={route.quote_reached} />
                        <RouteStat label="Started" value={route.repair_start_clicked} />
                        <RouteStat label="Submitted" value={route.repair_request_submitted} />
                        <RouteStat label="Arrived" value={route.device_received} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold mb-1">Selection behaviour</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">These counts describe how people navigate the selector. They are not a strict funnel because search and direct links can skip steps.</p>
              <div className="space-y-3">
                <Stage label="Started" count={data.visits.started} base={started} />
                <Stage label="Category selected" count={data.visits.category_selected} base={started} />
                <Stage label="Brand selected" count={data.visits.brand_selected} base={started} />
                <Stage label="Model selected" count={data.visits.model_selected} base={started} />
                <Stage label="Repair selected" count={data.visits.repair_selected} base={started} />
                <Stage label="Quote reached" count={data.visits.quote_reached} base={started} />
                <Stage label="Submitted" count={data.visits.submitted} base={started} />
              </div>
            </section>

            <section className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><Clock3 className="w-4 h-4" /> Catalogue loading</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Average" value={ms(data.catalogue.avg_load_ms)} />
                  <Stat label="Median" value={ms(data.catalogue.median_load_ms)} />
                  <Stat label="90th percentile" value={ms(data.catalogue.p90_load_ms)} />
                  <Stat label="Timeouts" value={String(data.catalogue.timeout_events)} />
                  <Stat label="Transfer size" value={bytes(data.catalogue.avg_transfer_bytes)} />
                  <Stat label="Decoded size" value={bytes(data.catalogue.avg_decoded_bytes)} />
                </dl>
              </div>

              <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Help routes</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Model help opened" value={String(data.help.model_help_opened)} />
                  <Stat label="Model not listed" value={String(data.help.model_unlisted)} />
                  <Stat label="Repair help used" value={String(data.help.repair_help_used)} />
                  <Stat label="Loading choice progressed" value={String(data.visits.category_loading_then_progressed)} />
                </dl>
              </div>
            </section>

            <p className="text-xs text-gray-500 dark:text-gray-400">Instrumentation began {data.instrumentation_started_at ? new Date(data.instrumentation_started_at).toLocaleString('en-GB') : 'recently'}. Older visits are intentionally excluded from these diagnostics.</p>
          </>
        )}
      </main>
    </div>
  )
}

function Metric({ title, value, sub, icon }: { title: string; value: number; sub: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4"><div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">{icon}{title}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div></div>
}

function Stage({ label, count, base }: { label: string; count: number; base: number }) {
  const width = base ? Math.max(2, Math.round((count / base) * 100)) : 0
  return <div><div className="flex justify-between gap-3 text-sm mb-1"><span>{label}</span><span className="font-medium">{count} · {pct(count, base)}</span></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"><div className="h-full bg-green-700 rounded-full" style={{ width: `${Math.min(width, 100)}%` }} /></div></div>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3"><dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt><dd className="font-semibold mt-1">{value}</dd></div>
}

function RouteStat({ label, value }: { label: string; value: number }) {
  return <div><div className="text-gray-500 dark:text-gray-400">{label}</div><div className="font-semibold text-sm mt-0.5">{value}</div></div>
}
