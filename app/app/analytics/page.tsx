'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, TrendingDown, Clock, Search, Users, Smartphone, Monitor, ArrowRight, RefreshCw, ExternalLink, Link2, Home, AlertCircle, Lightbulb, LogOut, Undo2, RotateCcw, MousePointerClick, Target } from 'lucide-react'
import Link from 'next/link'

interface AnalyticsData {
  success: boolean
  period_days: number
  total_sessions: number
  funnel: {
    steps: Record<number, { count: number; label: string }>
    actions: {
      Form_Started: number
      Form_Submitted: number
      Quote_Revealed: number
      Action_Clicked: number
    }
  }
  action_breakdown: [string, number][]
  hesitation_breakdown: [string, number][]
  traffic_sources: {
    utm_sources: [string, number][]
    utm_mediums: [string, number][]
    source_tags: [string, number][]
    referrers: [string, number][]
  }
  avg_step_times: Record<number, { avg_ms: number; median_ms: number; count: number; label: string }>
  popular: {
    categories: [string, number][]
    brands: [string, number][]
    repairs: [string, number][]
    combos: [string, number][]
  }
  search_queries: { query: string; count: number; zero_results: number }[]
  additional_repairs: {
    total_added: number
    breakdown: [string, number][]
  }
  device_breakdown: { mobile: number; desktop: number }
  accept_page: {
    views: number
    clicks: number
    conversion_rate: number
  }
  form_errors: [string, number][]
  budget_comparisons: { budget: number; quoted_price: number | null }[]
  exit_intent: { sessions: number; total_events: number }
  abandonment: { by_step: { step: number; label: string; count: number }[]; total_abandoned: number }
  back_navigation: [string, number][]
  start_again: { sessions: number; by_step: { step: number; label: string; count: number }[] }
  option_selections: { total: number; breakdown: [string, number][] }
  conversion_rate: number
  table_missing?: boolean
}

function formatTime(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

function pct(n: number, d: number): string {
  if (d === 0) return '0%'
  return Math.round((n / d) * 100) + '%'
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/analytics/summary?days=${days}`)
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const errJson = await res.json()
          detail = errJson.details || errJson.error || errJson.message || detail
        } catch {}
        throw new Error(detail)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const maxStepCount = data ? Math.max(...Object.values(data.funnel.steps).map(s => s.count), 1) : 1

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link href="/app" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Home className="h-5 w-5 text-primary" />
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                Analytics
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
              <button
                onClick={fetchData}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <Link
            href="/app/link-builder"
            className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg w-fit"
          >
            <Link2 className="w-4 h-4" />
            Link Builder
          </Link>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            Error loading analytics: {error}
          </div>
        )}

        {data?.table_missing && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-sm text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            Analytics table not set up yet. Run the SQL migration to start collecting data.
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-green-600 animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* Top Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Sessions"
                value={data.total_sessions}
                icon={<Users className="w-5 h-5" />}
                color="blue"
              />
              <StatCard
                label="Forms Submitted"
                value={data.funnel.actions.Form_Submitted}
                sub={`${data.conversion_rate}% conversion rate`}
                icon={<BarChart3 className="w-5 h-5" />}
                color="green"
              />
              <StatCard
                label="Accept Page Views"
                value={data.accept_page.views}
                sub={data.accept_page.conversion_rate + '% convert'}
                icon={<ExternalLink className="w-5 h-5" />}
                color="purple"
              />
              <StatCard
                label="Add-on Repairs"
                value={data.additional_repairs.total_added}
                sub="extra repairs added"
                icon={<TrendingDown className="w-5 h-5" />}
                color="orange"
              />
            </div>

            {/* Key Insights Summary */}
            <Section title="Key Insights" icon={<Lightbulb className="w-5 h-5" />}>
              <div className="space-y-2 text-sm">
                {data.total_sessions === 0 ? (
                  <EmptyState text="No data yet — start using the quote form to see insights here" />
                ) : (
                  <>
                    <InsightRow
                      icon={<Users className="w-4 h-4 text-blue-500" />}
                      text={`${data.total_sessions} ${data.total_sessions === 1 ? 'person has' : 'people have'} visited the quote form in the last ${data.period_days} days`}
                    />
                    <InsightRow
                      icon={<Target className="w-4 h-4 text-green-500" />}
                      text={`${data.conversion_rate}% of visitors completed and submitted the form (${data.funnel.actions.Form_Submitted} out of ${data.total_sessions})`}
                    />
                    {data.popular.categories.length > 0 && (
                      <InsightRow
                        icon={<BarChart3 className="w-4 h-4 text-purple-500" />}
                        text={`Most popular device category: ${data.popular.categories[0][0]} (${data.popular.categories[0][1]} ${data.popular.categories[0][1] === 1 ? 'quote' : 'quotes'})`}
                      />
                    )}
                    {data.popular.brands.length > 0 && (
                      <InsightRow
                        icon={<Smartphone className="w-4 h-4 text-indigo-500" />}
                        text={`Most popular brand: ${data.popular.brands[0][0]} (${data.popular.brands[0][1]} ${data.popular.brands[0][1] === 1 ? 'quote' : 'quotes'})`}
                      />
                    )}
                    {data.popular.repairs.length > 0 && (
                      <InsightRow
                        icon={<ArrowRight className="w-4 h-4 text-orange-500" />}
                        text={`Most requested repair type: ${data.popular.repairs[0][0]} (${data.popular.repairs[0][1]} ${data.popular.repairs[0][1] === 1 ? 'request' : 'requests'})`}
                      />
                    )}
                    {data.traffic_sources.utm_sources.length > 0 && data.traffic_sources.utm_sources[0][0] !== 'organic' && (
                      <InsightRow
                        icon={<Users className="w-4 h-4 text-teal-500" />}
                        text={`Top traffic source: ${data.traffic_sources.utm_sources[0][0]} (${data.traffic_sources.utm_sources[0][1]} ${data.traffic_sources.utm_sources[0][1] === 1 ? 'visit' : 'visits'})`}
                      />
                    )}
                    {data.traffic_sources.referrers.length > 0 && (
                      <InsightRow
                        icon={<ExternalLink className="w-4 h-4 text-cyan-500" />}
                        text={`Top referrer: ${data.traffic_sources.referrers[0][0]} (${data.traffic_sources.referrers[0][1]} ${data.traffic_sources.referrers[0][1] === 1 ? 'visit' : 'visits'})`}
                      />
                    )}
                    {data.abandonment.total_abandoned > 0 && data.abandonment.by_step.length > 0 && (
                      <InsightRow
                        icon={<LogOut className="w-4 h-4 text-red-500" />}
                        text={`${data.abandonment.total_abandoned} ${data.abandonment.total_abandoned === 1 ? 'person left' : 'people left'} without completing — most dropped off at ${data.abandonment.by_step.reduce((max, s) => s.count > max.count ? s : max, data.abandonment.by_step[0])?.label || 'unknown'}`}
                      />
                    )}
                    {data.device_breakdown.mobile + data.device_breakdown.desktop > 0 && (
                      <InsightRow
                        icon={data.device_breakdown.mobile > data.device_breakdown.desktop ? <Smartphone className="w-4 h-4 text-blue-500" /> : <Monitor className="w-4 h-4 text-gray-500" />}
                        text={`${Math.round((data.device_breakdown.mobile / (data.device_breakdown.mobile + data.device_breakdown.desktop)) * 100)}% on mobile, ${Math.round((data.device_breakdown.desktop / (data.device_breakdown.mobile + data.device_breakdown.desktop)) * 100)}% on desktop`}
                      />
                    )}
                    {data.exit_intent.sessions > 0 && (
                      <InsightRow
                        icon={<LogOut className="w-4 h-4 text-amber-500" />}
                        text={`${data.exit_intent.sessions} ${data.exit_intent.sessions === 1 ? 'person showed' : 'people showed'} exit intent (mouse moved to leave)`}
                      />
                    )}
                  </>
                )}
              </div>
            </Section>
            <Section title="Quote Funnel" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="space-y-2">
                {Object.entries(data.funnel.steps).map(([step, info]) => {
                  const width = (info.count / maxStepCount) * 100
                  const prevCount = step > '1' ? data.funnel.steps[parseInt(step) - 1]?.count : 0
                  const dropOff = prevCount > 0 ? Math.round(((prevCount - info.count) / prevCount) * 100) : 0
                  return (
                    <div key={step}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {info.label}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {info.count} {prevCount > 0 && dropOff > 0 && (
                            <span className="text-red-500 ml-1">↓{dropOff}%</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-7 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-end px-2 transition-all"
                          style={{ width: Math.max(width, 2) + '%' }}
                        >
                          <span className="text-xs text-white font-medium">{info.count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Post-form actions */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Post-Form Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Form Started" value={data.funnel.actions.Form_Started} />
                    <MiniStat label="Form Submitted" value={data.funnel.actions.Form_Submitted} />
                    <MiniStat label="Quote Revealed" value={data.funnel.actions.Quote_Revealed} />
                    <MiniStat label="Action Clicked" value={data.funnel.actions.Action_Clicked} />
                  </div>
                </div>
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-4">
              {/* Time per step */}
              <Section title="Time Per Step" icon={<Clock className="w-5 h-5" />}>
                <div className="space-y-2">
                  {Object.entries(data.avg_step_times).map(([step, info]) => (
                    <div key={step} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{info.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{info.count} samples</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          Avg {formatTime(info.avg_ms)}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                          Med {formatTime(info.median_ms)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Action breakdown */}
              <Section title="Post-Quote Actions" icon={<BarChart3 className="w-5 h-5" />}>
                {data.action_breakdown.length === 0 ? (
                  <EmptyState text="No actions recorded yet" />
                ) : (
                  <div className="space-y-2">
                    {data.action_breakdown.map(([action, count]) => (
                      <div key={action} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 capitalize">{action.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Hesitation reasons */}
              <Section title="Hesitation Reasons" icon={<TrendingDown className="w-5 h-5" />}>
                {data.hesitation_breakdown.length === 0 ? (
                  <EmptyState text="No hesitation data yet" />
                ) : (
                  <div className="space-y-2">
                    {data.hesitation_breakdown.map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 capitalize">{reason.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Device breakdown */}
              <Section title="Device Type" icon={<Smartphone className="w-5 h-5" />}>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.device_breakdown.mobile}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Mobile</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.device_breakdown.desktop}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Desktop</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Traffic Sources */}
            <Section title="Traffic Sources" icon={<Users className="w-5 h-5" />}>
              <div className="grid grid-cols-2 gap-4">
                <SourceList title="UTM Sources" items={data.traffic_sources.utm_sources} />
                <SourceList title="Mediums" items={data.traffic_sources.utm_mediums} />
                <SourceList title="Source Tags" items={data.traffic_sources.source_tags} />
                <SourceList title="Referrers" items={data.traffic_sources.referrers} />
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-4">
              {/* Popular devices */}
              <Section title="Popular Devices" icon={<BarChart3 className="w-5 h-5" />}>
                <div className="space-y-4">
                  <RankList title="Categories" items={data.popular.categories.slice(0, 8)} />
                  <RankList title="Brands" items={data.popular.brands.slice(0, 8)} />
                  <RankList title="Repairs" items={data.popular.repairs.slice(0, 8)} />
                </div>
              </Section>

              {/* Search queries */}
              <Section title="Search Queries" icon={<Search className="w-5 h-5" />}>
                {data.search_queries.length === 0 ? (
                  <EmptyState text="No searches recorded yet" />
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.search_queries.map((q, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 truncate">"{q.query}"</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-medium text-gray-900 dark:text-white">{q.count}x</span>
                          {q.zero_results > 0 && (
                            <span className="text-xs text-orange-500">{q.zero_results} no results</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* Popular combos */}
            <Section title="Popular Device + Repair Combinations" icon={<ArrowRight className="w-5 h-5" />}>
              {data.popular.combos.length === 0 ? (
                <EmptyState text="No quote submissions yet" />
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {data.popular.combos.map(([combo, count], i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <span className="text-gray-700 dark:text-gray-300 truncate">{combo}</span>
                      <span className="font-medium text-gray-900 flex-shrink-0 ml-2">{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="grid grid-cols-1 gap-4">
              {/* Form errors */}
              <Section title="Form Validation Errors" icon={<TrendingDown className="w-5 h-5" />}>
                {data.form_errors.length === 0 ? (
                  <EmptyState text="No form errors recorded" />
                ) : (
                  <div className="space-y-2">
                    {data.form_errors.map(([field, count]) => (
                      <div key={field} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 capitalize">{field.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-red-600 dark:text-red-400">{count} errors</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Additional repairs */}
              <Section title="Additional Repairs Added" icon={<BarChart3 className="w-5 h-5" />}>
                {data.additional_repairs.breakdown.length === 0 ? (
                  <EmptyState text="No add-on repairs selected yet" />
                ) : (
                  <div className="space-y-2">
                    {data.additional_repairs.breakdown.map(([repair, count]) => (
                      <div key={repair} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 capitalize">{repair.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* Budget vs quoted */}
            {data.budget_comparisons.length > 0 && (
              <Section title="Budget vs Quoted Price" icon={<BarChart3 className="w-5 h-5" />}>
                <div className="space-y-2">
                  {data.budget_comparisons.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <span className="text-gray-700 dark:text-gray-300">
                        Budget: <strong>£{b.budget}</strong>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {b.quoted_price ? `Quoted: £${b.quoted_price}` : 'No price quoted'}
                      </span>
                      {b.quoted_price && (
                        <span className={`font-medium ${b.budget < b.quoted_price ? 'text-red-600' : 'text-green-600'}`}>
                          {b.budget < b.quoted_price ? `£${b.quoted_price - b.budget} short` : `£${b.budget - b.quoted_price} over`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Exit & Abandonment */}
            <Section title="Where People Leave" icon={<LogOut className="w-5 h-5" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Left Without Completing" value={data.abandonment.total_abandoned} />
                  <MiniStat label="Showed Exit Intent" value={data.exit_intent.sessions} />
                </div>
                {data.abandonment.by_step.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Drop-off by Step</div>
                    {data.abandonment.by_step.map((s) => {
                      const maxAbandon = Math.max(...data.abandonment.by_step.map(x => x.count), 1)
                      const width = (s.count / maxAbandon) * 100
                      return (
                        <div key={s.step}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-700 dark:text-gray-300">{s.label}</span>
                            <span className="text-red-500 font-medium">{s.count} {s.count === 1 ? 'person' : 'people'}</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-red-300 to-red-500 rounded-full transition-all"
                              style={{ width: Math.max(width, 2) + '%' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState text="No abandonment data yet" />
                )}
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-4">
              {/* Quote Option Selections */}
              <Section title="Quote Options Chosen" icon={<MousePointerClick className="w-5 h-5" />}>
                {data.option_selections.total === 0 ? (
                  <EmptyState text="No quote options selected yet" />
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {data.option_selections.total} {data.option_selections.total === 1 ? 'option' : 'options'} selected in total
                    </div>
                    {data.option_selections.breakdown.map(([option, count]) => (
                      <div key={option} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 capitalize">{option.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Back Navigation */}
              <Section title="People Going Back" icon={<Undo2 className="w-5 h-5" />}>
                {data.back_navigation.length === 0 ? (
                  <EmptyState text="No back navigation recorded yet" />
                ) : (
                  <div className="space-y-2">
                    {data.back_navigation.map(([nav, count]) => (
                      <div key={nav} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{nav}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Start Again */}
              <Section title="People Starting Over" icon={<RotateCcw className="w-5 h-5" />}>
                {data.start_again.sessions === 0 ? (
                  <EmptyState text="No restarts recorded yet" />
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {data.start_again.sessions} {data.start_again.sessions === 1 ? 'person' : 'people'} restarted their quote
                    </div>
                    {data.start_again.by_step.map((s) => (
                      <div key={s.step} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Restarted at {s.label}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{s.count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: number; sub?: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
      <div className="text-base font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  )
}

function SourceList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 8).map(([source, count]) => (
            <div key={source} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300 truncate">{source}</span>
              <span className="font-medium text-gray-900 dark:text-white flex-shrink-0 ml-2">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RankList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
      ) : (
        <div className="space-y-1">
          {items.map(([name, count], i) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 dark:text-gray-500 w-5">{i + 1}.</span>
              <span className="text-gray-700 dark:text-gray-300 flex-1 truncate capitalize">{name}</span>
              <span className="font-medium text-gray-900 dark:text-white">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{text}</p>
}

function InsightRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-gray-700 dark:text-gray-300">
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <span>{text}</span>
    </div>
  )
}
