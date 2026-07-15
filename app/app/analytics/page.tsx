'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, TrendingDown, Clock, Search, Users, Smartphone, Monitor, ArrowRight, RefreshCw, ExternalLink, Link2 } from 'lucide-react'
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
      if (!res.ok) throw new Error('Failed to fetch analytics')
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-gray-500 hover:text-gray-700 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-600" />
              Quote Analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="text-sm border rounded-lg px-3 py-1.5 bg-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={fetchData}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="https://newforestdevicerepairs.co.uk/link-builder/"
              target="_blank"
              className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium px-3 py-1.5 bg-green-50 rounded-lg"
            >
              <Link2 className="w-4 h-4" />
              Link Builder
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            Error loading analytics: {error}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Sessions"
                value={data.total_sessions}
                icon={<Users className="w-5 h-5" />}
                color="blue"
              />
              <StatCard
                label="Forms Submitted"
                value={data.funnel.actions.Form_Submitted}
                sub={pct(data.funnel.actions.Form_Submitted, data.total_sessions) + ' of sessions'}
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

            {/* Funnel */}
            <Section title="Quote Funnel" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="space-y-3">
                {Object.entries(data.funnel.steps).map(([step, info]) => {
                  const width = (info.count / maxStepCount) * 100
                  const prevCount = step > '1' ? data.funnel.steps[parseInt(step) - 1]?.count : 0
                  const dropOff = prevCount > 0 ? Math.round(((prevCount - info.count) / prevCount) * 100) : 0
                  return (
                    <div key={step}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">
                          Step {step}: {info.label}
                        </span>
                        <span className="text-gray-500">
                          {info.count} {prevCount > 0 && dropOff > 0 && (
                            <span className="text-red-500 ml-2">↓ {dropOff}% drop-off</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-end px-3 transition-all"
                          style={{ width: Math.max(width, 2) + '%' }}
                        >
                          <span className="text-xs text-white font-medium">{info.count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Post-form actions */}
                <div className="pt-3 border-t">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Post-Form Actions</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniStat label="Form Started" value={data.funnel.actions.Form_Started} />
                    <MiniStat label="Form Submitted" value={data.funnel.actions.Form_Submitted} />
                    <MiniStat label="Quote Revealed" value={data.funnel.actions.Quote_Revealed} />
                    <MiniStat label="Action Clicked" value={data.funnel.actions.Action_Clicked} />
                  </div>
                </div>
              </div>
            </Section>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Time per step */}
              <Section title="Time Per Step" icon={<Clock className="w-5 h-5" />}>
                <div className="space-y-2">
                  {Object.entries(data.avg_step_times).map(([step, info]) => (
                    <div key={step} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{info.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 text-xs">{info.count} samples</span>
                        <span className="font-medium text-gray-900">
                          Avg {formatTime(info.avg_ms)}
                        </span>
                        <span className="text-gray-400 text-xs">
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
                        <span className="text-gray-700 capitalize">{action.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900">{count}</span>
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
                        <span className="text-gray-700 capitalize">{reason.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900">{count}</span>
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
                      <div className="text-2xl font-bold text-gray-900">{data.device_breakdown.mobile}</div>
                      <div className="text-xs text-gray-500">Mobile</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{data.device_breakdown.desktop}</div>
                      <div className="text-xs text-gray-500">Desktop</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Traffic Sources */}
            <Section title="Traffic Sources" icon={<Users className="w-5 h-5" />}>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SourceList title="UTM Sources" items={data.traffic_sources.utm_sources} />
                <SourceList title="Mediums" items={data.traffic_sources.utm_mediums} />
                <SourceList title="Source Tags" items={data.traffic_sources.source_tags} />
                <SourceList title="Referrers" items={data.traffic_sources.referrers} />
              </div>
            </Section>

            <div className="grid md:grid-cols-2 gap-6">
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
                        <span className="text-gray-700 truncate">"{q.query}"</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-medium text-gray-900">{q.count}x</span>
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
                <div className="grid md:grid-cols-2 gap-2">
                  {data.popular.combos.map(([combo, count], i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-700 truncate">{combo}</span>
                      <span className="font-medium text-gray-900 flex-shrink-0 ml-2">{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Form errors */}
              <Section title="Form Validation Errors" icon={<TrendingDown className="w-5 h-5" />}>
                {data.form_errors.length === 0 ? (
                  <EmptyState text="No form errors recorded" />
                ) : (
                  <div className="space-y-2">
                    {data.form_errors.map(([field, count]) => (
                      <div key={field} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 capitalize">{field.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-red-600">{count} errors</span>
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
                        <span className="text-gray-700 capitalize">{repair.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900">{count}x</span>
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
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-700">
                        Budget: <strong>£{b.budget}</strong>
                      </span>
                      <span className="text-gray-500">
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
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: number; sub?: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <span className="text-gray-400">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function SourceList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No data</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 10).map(([source, count]) => (
            <div key={source} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 truncate">{source}</span>
              <span className="font-medium text-gray-900 flex-shrink-0 ml-2">{count}</span>
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
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No data</p>
      ) : (
        <div className="space-y-1">
          {items.map(([name, count], i) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-5">{i + 1}.</span>
              <span className="text-gray-700 flex-1 truncate capitalize">{name}</span>
              <span className="font-medium text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 text-center py-6">{text}</p>
}
