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

type SheetType = 'funnel' | 'traffic' | 'devices' | 'behavior' | 'abandonment' | 'actions' | 'errors' | 'search' | 'addons' | 'budget' | 'insights' | null

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [activeSheet, setActiveSheet] = useState<SheetType>(null)

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
  const totalDevices = data ? data.device_breakdown.mobile + data.device_breakdown.desktop : 0
  const mobilePct = totalDevices > 0 && data ? Math.round((data.device_breakdown.mobile / totalDevices) * 100) : 0
  const biggestDropStep = data && data.abandonment.by_step.length > 0
    ? data.abandonment.by_step.reduce((max, s) => s.count > max.count ? s : max, data.abandonment.by_step[0])
    : null

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

      <main className="p-4 space-y-3 max-w-2xl mx-auto pb-20">
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

        {data && data.total_sessions === 0 && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <BarChart3 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No analytics data yet for this period. Start using the quote form to collect data.</p>
          </div>
        )}

        {data && data.total_sessions > 0 && (
          <>
            {/* Overview Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              <OverviewCard
                label="Visitors"
                value={data.total_sessions}
                sub={`last ${data.period_days} days`}
                icon={<Users className="w-5 h-5" />}
                color="blue"
              />
              <OverviewCard
                label="Conversion"
                value={`${data.conversion_rate}%`}
                sub={`${data.funnel.actions.Form_Submitted} forms submitted`}
                icon={<Target className="w-5 h-5" />}
                color="green"
              />
            </div>

            {/* Tappable Summary Cards */}
            <div className="space-y-2.5 pt-1">
              {/* Key Insights - always first, most useful */}
              <SummaryCard
                onClick={() => setActiveSheet('insights')}
                icon={<Lightbulb className="w-5 h-5 text-amber-500" />}
                title="Key Insights"
                subtitle={
                  data.total_sessions > 0
                    ? `${data.conversion_rate}% convert${data.popular.categories.length > 0 ? ` · ${data.popular.categories[0][0]} most popular` : ''}${biggestDropStep ? ` · drop-off at ${biggestDropStep.label}` : ''}`
                    : 'No data yet'
                }
              />

              {/* Funnel */}
              <SummaryCard
                onClick={() => setActiveSheet('funnel')}
                icon={<BarChart3 className="w-5 h-5 text-green-600" />}
                title="Quote Funnel"
                subtitle={`${data.funnel.steps[1]?.count || 0} started · ${data.funnel.actions.Form_Submitted} submitted · ${data.funnel.actions.Quote_Revealed} saw quotes`}
                progress={{
                  current: data.funnel.actions.Form_Submitted,
                  total: data.funnel.steps[1]?.count || 0,
                }}
              />

              {/* Where People Leave */}
              <SummaryCard
                onClick={() => setActiveSheet('abandonment')}
                icon={<LogOut className="w-5 h-5 text-red-500" />}
                title="Where People Leave"
                subtitle={
                  data.abandonment.total_abandoned > 0
                    ? `${data.abandonment.total_abandoned} left without completing${biggestDropStep ? ` · most at ${biggestDropStep.label}` : ''}`
                    : 'No drop-off data yet'
                }
                badge={data.abandonment.total_abandoned > 0 ? data.abandonment.total_abandoned : undefined}
                badgeColor="red"
              />

              {/* Traffic Sources */}
              <SummaryCard
                onClick={() => setActiveSheet('traffic')}
                icon={<Users className="w-5 h-5 text-teal-500" />}
                title="Traffic Sources"
                subtitle={
                  data.traffic_sources.utm_sources.length > 0 || data.traffic_sources.referrers.length > 0
                    ? `${data.traffic_sources.utm_sources[0]?.[0] || data.traffic_sources.referrers[0]?.[0] || 'various'} is top source`
                    : 'No source data yet'
                }
              />

              {/* Popular Devices */}
              <SummaryCard
                onClick={() => setActiveSheet('devices')}
                icon={<Smartphone className="w-5 h-5 text-indigo-500" />}
                title="Popular Devices & Repairs"
                subtitle={
                  data.popular.categories.length > 0
                    ? `${data.popular.categories[0][0]}${data.popular.brands.length > 0 ? ` · ${data.popular.brands[0][0]}` : ''}${data.popular.repairs.length > 0 ? ` · ${data.popular.repairs[0][0]}` : ''}`
                    : 'No device data yet'
                }
              />

              {/* Device Type */}
              <SummaryCard
                onClick={() => setActiveSheet('devices')}
                icon={mobilePct >= 50 ? <Smartphone className="w-5 h-5 text-blue-500" /> : <Monitor className="w-5 h-5 text-gray-500" />}
                title="Mobile vs Desktop"
                subtitle={`${mobilePct}% mobile · ${100 - mobilePct}% desktop`}
                progress={{ current: data.device_breakdown.mobile, total: totalDevices }}
              />

              {/* Post-Quote Actions */}
              <SummaryCard
                onClick={() => setActiveSheet('actions')}
                icon={<MousePointerClick className="w-5 h-5 text-purple-500" />}
                title="Post-Quote Actions"
                subtitle={
                  data.action_breakdown.length > 0
                    ? `${data.action_breakdown[0][0].replace(/_/g, ' ')} is most common`
                    : 'No actions recorded yet'
                }
                badge={data.funnel.actions.Action_Clicked > 0 ? data.funnel.actions.Action_Clicked : undefined}
                badgeColor="purple"
              />

              {/* Behavior: Back nav, start again, exit intent */}
              <SummaryCard
                onClick={() => setActiveSheet('behavior')}
                icon={<Undo2 className="w-5 h-5 text-orange-500" />}
                title="User Behavior"
                subtitle={[
                  data.back_navigation.length > 0 ? `${data.back_navigation.length} back-nav patterns` : null,
                  data.start_again.sessions > 0 ? `${data.start_again.sessions} restarts` : null,
                  data.exit_intent.sessions > 0 ? `${data.exit_intent.sessions} exit intents` : null,
                ].filter(Boolean).join(' · ') || 'No behavior data yet'}
              />

              {/* Search Queries */}
              <SummaryCard
                onClick={() => setActiveSheet('search')}
                icon={<Search className="w-5 h-5 text-cyan-500" />}
                title="Search Queries"
                subtitle={
                  data.search_queries.length > 0
                    ? `${data.search_queries.length} unique searches · "${data.search_queries[0].query}" most common`
                    : 'No searches recorded yet'
                }
                badge={data.search_queries.length > 0 ? data.search_queries.length : undefined}
                badgeColor="cyan"
              />

              {/* Additional Repairs */}
              <SummaryCard
                onClick={() => setActiveSheet('addons')}
                icon={<TrendingDown className="w-5 h-5 text-orange-500" />}
                title="Add-on Repairs"
                subtitle={
                  data.additional_repairs.total_added > 0
                    ? `${data.additional_repairs.total_added} add-ons selected`
                    : 'No add-ons selected yet'
                }
                badge={data.additional_repairs.total_added > 0 ? data.additional_repairs.total_added : undefined}
                badgeColor="orange"
              />

              {/* Form Errors */}
              {data.form_errors.length > 0 && (
                <SummaryCard
                  onClick={() => setActiveSheet('errors')}
                  icon={<AlertCircle className="w-5 h-5 text-red-400" />}
                  title="Form Errors"
                  subtitle={`${data.form_errors.length} field${data.form_errors.length === 1 ? '' : 's'} causing issues`}
                  badge={data.form_errors.reduce((s, [, c]) => s + c, 0)}
                  badgeColor="red"
                />
              )}

              {/* Budget vs Quoted */}
              {data.budget_comparisons.length > 0 && (
                <SummaryCard
                  onClick={() => setActiveSheet('budget')}
                  icon={<BarChart3 className="w-5 h-5 text-green-500" />}
                  title="Budget vs Quoted"
                  subtitle={`${data.budget_comparisons.length} budget submission${data.budget_comparisons.length === 1 ? '' : 's'}`}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* Slide-up Bottom Sheet */}
      {activeSheet && data && (
        <BottomSheet onClose={() => setActiveSheet(null)} title={sheetTitle(activeSheet)} icon={sheetIcon(activeSheet)}>
          {activeSheet === 'insights' && <InsightsSheet data={data} />}
          {activeSheet === 'funnel' && <FunnelSheet data={data} maxStepCount={maxStepCount} />}
          {activeSheet === 'abandonment' && <AbandonmentSheet data={data} />}
          {activeSheet === 'traffic' && <TrafficSheet data={data} />}
          {activeSheet === 'devices' && <DevicesSheet data={data} />}
          {activeSheet === 'actions' && <ActionsSheet data={data} />}
          {activeSheet === 'behavior' && <BehaviorSheet data={data} />}
          {activeSheet === 'search' && <SearchSheet data={data} />}
          {activeSheet === 'addons' && <AddonsSheet data={data} />}
          {activeSheet === 'errors' && <ErrorsSheet data={data} />}
          {activeSheet === 'budget' && <BudgetSheet data={data} />}
        </BottomSheet>
      )}
    </div>
  )
}

// ============================================
// Helper functions for sheets
// ============================================

function sheetTitle(sheet: SheetType): string {
  const titles: Record<string, string> = {
    insights: 'Key Insights',
    funnel: 'Quote Funnel',
    abandonment: 'Where People Leave',
    traffic: 'Traffic Sources',
    devices: 'Popular Devices & Repairs',
    actions: 'Post-Quote Actions',
    behavior: 'User Behavior',
    search: 'Search Queries',
    addons: 'Add-on Repairs',
    errors: 'Form Errors',
    budget: 'Budget vs Quoted',
  }
  return titles[sheet || ''] || 'Details'
}

function sheetIcon(sheet: SheetType): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    insights: <Lightbulb className="w-5 h-5 text-amber-500" />,
    funnel: <BarChart3 className="w-5 h-5 text-green-600" />,
    abandonment: <LogOut className="w-5 h-5 text-red-500" />,
    traffic: <Users className="w-5 h-5 text-teal-500" />,
    devices: <Smartphone className="w-5 h-5 text-indigo-500" />,
    actions: <MousePointerClick className="w-5 h-5 text-purple-500" />,
    behavior: <Undo2 className="w-5 h-5 text-orange-500" />,
    search: <Search className="w-5 h-5 text-cyan-500" />,
    addons: <TrendingDown className="w-5 h-5 text-orange-500" />,
    errors: <AlertCircle className="w-5 h-5 text-red-400" />,
    budget: <BarChart3 className="w-5 h-5 text-green-500" />,
  }
  return icons[sheet || ''] || <BarChart3 className="w-5 h-5" />
}

// ============================================
// UI Components
// ============================================

function OverviewCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SummaryCard({
  onClick, icon, title, subtitle, progress, badge, badgeColor,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  progress?: { current: number; total: number }
  badge?: number
  badgeColor?: string
}) {
  const badgeColors: Record<string, string> = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  }
  return (
    <button
      onClick={onClick}
      className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 text-left hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {badge !== undefined && badge > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColors[badgeColor || 'green'] || badgeColors.green}`}>
                  {badge}
                </span>
              )}
              <svg className="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>
          {progress && progress.total > 0 && (
            <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function BottomSheet({ onClose, title, icon, children }: { onClose: () => void; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-[fadeIn_0.2s_ease]"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-[slideUp_0.3s_ease]">
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <span className={`font-medium ${valueColor || 'text-gray-900 dark:text-white'}`}>{value}</span>
    </div>
  )
}

function DetailBar({ label, count, max, color = 'green' }: { label: string; count: number; max: number; color?: string }) {
  const colors: Record<string, string> = {
    green: 'from-green-400 to-green-600',
    red: 'from-red-300 to-red-500',
    blue: 'from-blue-400 to-blue-600',
    purple: 'from-purple-400 to-purple-600',
  }
  const width = max > 0 ? (count / max) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{count}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colors[color] || colors.green} rounded-full transition-all`}
          style={{ width: Math.max(width, 2) + '%' }}
        />
      </div>
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

function SourceList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 10).map(([source, count]) => (
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

// ============================================
// Sheet Content Components
// ============================================

function InsightsSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-2.5 text-sm">
      <InsightRow icon={<Users className="w-4 h-4 text-blue-500" />} text={`${data.total_sessions} ${data.total_sessions === 1 ? 'person has' : 'people have'} visited the quote form in the last ${data.period_days} days`} />
      <InsightRow icon={<Target className="w-4 h-4 text-green-500" />} text={`${data.conversion_rate}% of visitors completed and submitted the form (${data.funnel.actions.Form_Submitted} out of ${data.total_sessions})`} />
      {data.popular.categories.length > 0 && (
        <InsightRow icon={<BarChart3 className="w-4 h-4 text-purple-500" />} text={`Most popular device category: ${data.popular.categories[0][0]} (${data.popular.categories[0][1]} ${data.popular.categories[0][1] === 1 ? 'quote' : 'quotes'})`} />
      )}
      {data.popular.brands.length > 0 && (
        <InsightRow icon={<Smartphone className="w-4 h-4 text-indigo-500" />} text={`Most popular brand: ${data.popular.brands[0][0]} (${data.popular.brands[0][1]} ${data.popular.brands[0][1] === 1 ? 'quote' : 'quotes'})`} />
      )}
      {data.popular.repairs.length > 0 && (
        <InsightRow icon={<ArrowRight className="w-4 h-4 text-orange-500" />} text={`Most requested repair type: ${data.popular.repairs[0][0]} (${data.popular.repairs[0][1]} ${data.popular.repairs[0][1] === 1 ? 'request' : 'requests'})`} />
      )}
      {data.traffic_sources.utm_sources.length > 0 && data.traffic_sources.utm_sources[0][0] !== 'organic' && (
        <InsightRow icon={<Users className="w-4 h-4 text-teal-500" />} text={`Top traffic source: ${data.traffic_sources.utm_sources[0][0]} (${data.traffic_sources.utm_sources[0][1]} ${data.traffic_sources.utm_sources[0][1] === 1 ? 'visit' : 'visits'})`} />
      )}
      {data.traffic_sources.referrers.length > 0 && (
        <InsightRow icon={<ExternalLink className="w-4 h-4 text-cyan-500" />} text={`Top referrer: ${data.traffic_sources.referrers[0][0]} (${data.traffic_sources.referrers[0][1]} ${data.traffic_sources.referrers[0][1] === 1 ? 'visit' : 'visits'})`} />
      )}
      {data.abandonment.total_abandoned > 0 && data.abandonment.by_step.length > 0 && (
        <InsightRow icon={<LogOut className="w-4 h-4 text-red-500" />} text={`${data.abandonment.total_abandoned} ${data.abandonment.total_abandoned === 1 ? 'person left' : 'people left'} without completing — most dropped off at ${data.abandonment.by_step.reduce((max, s) => s.count > max.count ? s : max, data.abandonment.by_step[0])?.label || 'unknown'}`} />
      )}
      {data.device_breakdown.mobile + data.device_breakdown.desktop > 0 && (
        <InsightRow icon={data.device_breakdown.mobile > data.device_breakdown.desktop ? <Smartphone className="w-4 h-4 text-blue-500" /> : <Monitor className="w-4 h-4 text-gray-500" />} text={`${Math.round((data.device_breakdown.mobile / (data.device_breakdown.mobile + data.device_breakdown.desktop)) * 100)}% on mobile, ${Math.round((data.device_breakdown.desktop / (data.device_breakdown.mobile + data.device_breakdown.desktop)) * 100)}% on desktop`} />
      )}
      {data.exit_intent.sessions > 0 && (
        <InsightRow icon={<LogOut className="w-4 h-4 text-amber-500" />} text={`${data.exit_intent.sessions} ${data.exit_intent.sessions === 1 ? 'person showed' : 'people showed'} exit intent (mouse moved to leave)`} />
      )}
      {data.accept_page.views > 0 && (
        <InsightRow icon={<ExternalLink className="w-4 h-4 text-purple-500" />} text={`${data.accept_page.views} ${data.accept_page.views === 1 ? 'person viewed' : 'people viewed'} the accept page, ${data.accept_page.conversion_rate}% clicked accept`} />
      )}
    </div>
  )
}

function FunnelSheet({ data, maxStepCount }: { data: AnalyticsData; maxStepCount: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {Object.entries(data.funnel.steps).map(([step, info]) => {
          const prevCount = step > '1' ? data.funnel.steps[parseInt(step) - 1]?.count : 0
          const dropOff = prevCount > 0 ? Math.round(((prevCount - info.count) / prevCount) * 100) : 0
          return (
            <DetailBar
              key={step}
              label={`${info.label}${prevCount > 0 && dropOff > 0 ? ` (↓${dropOff}%)` : ''}`}
              count={info.count}
              max={maxStepCount}
              color="green"
            />
          )
        })}
      </div>
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Post-Form Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-gray-900 dark:text-white">{data.funnel.actions.Form_Started}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Form Started</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-gray-900 dark:text-white">{data.funnel.actions.Form_Submitted}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Form Submitted</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-gray-900 dark:text-white">{data.funnel.actions.Quote_Revealed}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Quote Revealed</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-gray-900 dark:text-white">{data.funnel.actions.Action_Clicked}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Action Clicked</div>
          </div>
        </div>
      </div>
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Time Per Step</h3>
        <div className="space-y-2">
          {Object.entries(data.avg_step_times).map(([step, info]) => (
            <DetailRow
              key={step}
              label={`${info.label} (${info.count} samples)`}
              value={`Avg ${formatTime(info.avg_ms)} · Med ${formatTime(info.median_ms)}`}
              valueColor="text-gray-500 dark:text-gray-400"
            />
          ))}
        </div>
      </div>
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Popular Device + Repair Combos</h3>
        {data.popular.combos.length === 0 ? (
          <EmptyState text="No quote submissions yet" />
        ) : (
          <div className="space-y-1.5">
            {data.popular.combos.slice(0, 15).map(([combo, count], i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <span className="text-gray-700 dark:text-gray-300 truncate">{combo}</span>
                <span className="font-medium text-gray-900 flex-shrink-0 ml-2">{count}x</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {data.option_selections.total > 0 && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quote Options Chosen ({data.option_selections.total} total)</h3>
          <div className="space-y-1.5">
            {data.option_selections.breakdown.map(([option, count]) => (
              <DetailRow key={option} label={option.replace(/_/g, ' ')} value={`${count}x`} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AbandonmentSheet({ data }: { data: AnalyticsData }) {
  const maxAbandon = Math.max(...data.abandonment.by_step.map(x => x.count), 1)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{data.abandonment.total_abandoned}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Left Without Completing</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.exit_intent.sessions}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Showed Exit Intent</div>
        </div>
      </div>
      {data.abandonment.by_step.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Drop-off by Step</h3>
          {data.abandonment.by_step.map((s) => (
            <DetailBar key={s.step} label={s.label} count={s.count} max={maxAbandon} color="red" />
          ))}
        </div>
      ) : (
        <EmptyState text="No abandonment data yet" />
      )}
    </div>
  )
}

function TrafficSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-4">
      <SourceList title="UTM Sources" items={data.traffic_sources.utm_sources} />
      <SourceList title="Mediums" items={data.traffic_sources.utm_mediums} />
      <SourceList title="Source Tags" items={data.traffic_sources.source_tags} />
      <SourceList title="Referrers" items={data.traffic_sources.referrers} />
    </div>
  )
}

function DevicesSheet({ data }: { data: AnalyticsData }) {
  const totalDevices = data.device_breakdown.mobile + data.device_breakdown.desktop
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Mobile vs Desktop</h3>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.device_breakdown.mobile}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{totalDevices > 0 ? Math.round((data.device_breakdown.mobile / totalDevices) * 100) : 0}% Mobile</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.device_breakdown.desktop}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{totalDevices > 0 ? Math.round((data.device_breakdown.desktop / totalDevices) * 100) : 0}% Desktop</div>
            </div>
          </div>
        </div>
      </div>
      <RankList title="Categories" items={data.popular.categories.slice(0, 10)} />
      <RankList title="Brands" items={data.popular.brands.slice(0, 10)} />
      <RankList title="Repairs" items={data.popular.repairs.slice(0, 10)} />
    </div>
  )
}

function ActionsSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Action Breakdown</h3>
        {data.action_breakdown.length === 0 ? (
          <EmptyState text="No actions recorded yet" />
        ) : (
          <div className="space-y-2">
            {data.action_breakdown.map(([action, count]) => (
              <DetailRow key={action} label={action.replace(/_/g, ' ')} value={count} />
            ))}
          </div>
        )}
      </div>
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Hesitation Reasons</h3>
        {data.hesitation_breakdown.length === 0 ? (
          <EmptyState text="No hesitation data yet" />
        ) : (
          <div className="space-y-2">
            {data.hesitation_breakdown.map(([reason, count]) => (
              <DetailRow key={reason} label={reason.replace(/_/g, ' ')} value={count} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BehaviorSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Back Navigation</h3>
        {data.back_navigation.length === 0 ? (
          <EmptyState text="No back navigation recorded yet" />
        ) : (
          <div className="space-y-2">
            {data.back_navigation.map(([nav, count]) => (
              <DetailRow key={nav} label={nav} value={`${count}x`} />
            ))}
          </div>
        )}
      </div>
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">People Starting Over ({data.start_again.sessions} total)</h3>
        {data.start_again.sessions === 0 ? (
          <EmptyState text="No restarts recorded yet" />
        ) : (
          <div className="space-y-2">
            {data.start_again.by_step.map((s) => (
              <DetailRow key={s.step} label={`Restarted at ${s.label}`} value={`${s.count}x`} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SearchSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-2">
      {data.search_queries.length === 0 ? (
        <EmptyState text="No searches recorded yet" />
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.search_queries.map((q, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
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
    </div>
  )
}

function AddonsSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-2">
      {data.additional_repairs.breakdown.length === 0 ? (
        <EmptyState text="No add-on repairs selected yet" />
      ) : (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {data.additional_repairs.total_added} add-on{data.additional_repairs.total_added === 1 ? '' : 's'} selected in total
          </div>
          {data.additional_repairs.breakdown.map(([repair, count]) => (
            <DetailRow key={repair} label={repair.replace(/_/g, ' ')} value={`${count}x`} />
          ))}
        </>
      )}
    </div>
  )
}

function ErrorsSheet({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-2">
      {data.form_errors.length === 0 ? (
        <EmptyState text="No form errors recorded" />
      ) : (
        data.form_errors.map(([field, count]) => (
          <DetailRow key={field} label={field.replace(/_/g, ' ')} value={`${count} errors`} valueColor="text-red-600 dark:text-red-400" />
        ))
      )}
    </div>
  )
}

function BudgetSheet({ data }: { data: AnalyticsData }) {
  return (
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
  )
}
