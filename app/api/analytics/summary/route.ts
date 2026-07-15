import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateISO = startDate.toISOString()

    // Check if the table exists by doing a minimal query
    const { error: tableCheckError } = await supabase
      .from('quote_analytics_events')
      .select('id')
      .limit(1)

    if (tableCheckError) {
      // Table doesn't exist or isn't accessible — return empty data
      return NextResponse.json({
        success: true,
        period_days: days,
        total_sessions: 0,
        funnel: {
          steps: { 1: { count: 0, label: 'Category' }, 2: { count: 0, label: 'Brand' }, 3: { count: 0, label: 'Model' }, 4: { count: 0, label: 'Repair' }, 5: { count: 0, label: 'Quote Details' } },
          actions: { Form_Started: 0, Form_Submitted: 0, Quote_Revealed: 0, Action_Clicked: 0 },
        },
        action_breakdown: [],
        hesitation_breakdown: [],
        traffic_sources: { utm_sources: [], utm_mediums: [], source_tags: [], referrers: [] },
        avg_step_times: {},
        popular: { categories: [], brands: [], repairs: [], combos: [] },
        search_queries: [],
        additional_repairs: { total_added: 0, breakdown: [] },
        device_breakdown: { mobile: 0, desktop: 0 },
        accept_page: { views: 0, clicks: 0, conversion_rate: 0 },
        form_errors: [],
        budget_comparisons: [] as Array<{ budget: number; quoted_price: number | null }>,
        table_missing: true,
      })
    }

    // 1. Funnel — count distinct sessions per event type
    const { data: funnelData } = await supabase
      .from('quote_analytics_events')
      .select('event_type, session_id')
      .gte('created_at', startDateISO)

    // Build funnel counts
    const funnelSteps = [
      'quote_step_enter',
      'quote_form_start',
      'quote_form_submit',
      'quote_reveal',
      'quote_action_click',
    ]
    const stepLabels: Record<string, string> = {
      'quote_step_enter': 'Step 1 (Category)',
      'quote_form_start': 'Form Started',
      'quote_form_submit': 'Form Submitted',
      'quote_reveal': 'Quote Revealed',
      'quote_action_click': 'Action Clicked',
    }

    // Count distinct sessions per step, and also per step number for quote_step_enter
    const stepSessions: Record<string, Set<string>> = {}
    const stepNumberSessions: Record<number, Set<string>> = {}
    funnelSteps.forEach(s => { stepSessions[s] = new Set() })

    (funnelData || []).forEach((row: any) => {
      if (row.event_type === 'quote_step_enter') {
        stepSessions['quote_step_enter'].add(row.session_id)
        // Also track by step number from event_data — but we don't have event_data here
      } else if (stepSessions[row.event_type]) {
        stepSessions[row.event_type].add(row.session_id)
      }
    })

    // Get step-level funnel (step 1 through 5)
    const { data: stepEnterData } = await supabase
      .from('quote_analytics_events')
      .select('session_id, event_data')
      .eq('event_type', 'quote_step_enter')
      .gte('created_at', startDateISO)

    const stepFunnel: Record<number, { count: number; label: string }> = {}
    const stepSessionSets: Record<number, Set<string>> = {}
    for (let i = 1; i <= 5; i++) {
      stepSessionSets[i] = new Set()
      stepFunnel[i] = { count: 0, label: ['', 'Category', 'Brand', 'Model', 'Repair', 'Quote Details'][i] }
    }
    (stepEnterData || []).forEach((row: any) => {
      const stepNum = row.event_data?.step || 1
      if (stepNum >= 1 && stepNum <= 5) {
        stepSessionSets[stepNum].add(row.session_id)
      }
    })
    for (let i = 1; i <= 5; i++) {
      stepFunnel[i].count = stepSessionSets[i].size
    }

    // 2. Action breakdown
    const { data: actionData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_action_click')
      .gte('created_at', startDateISO)

    const actionBreakdown: Record<string, number> = {}
    ;(actionData || []).forEach((row: any) => {
      const action = row.event_data?.action || 'unknown'
      actionBreakdown[action] = (actionBreakdown[action] || 0) + 1
    })

    // 3. Hesitation reasons
    const { data: hesitationData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_hesitation_reason')
      .gte('created_at', startDateISO)

    const hesitationBreakdown: Record<string, number> = {}
    ;(hesitationData || []).forEach((row: any) => {
      const reason = row.event_data?.reason || 'unknown'
      hesitationBreakdown[reason] = (hesitationBreakdown[reason] || 0) + 1
    })

    // 4. Traffic sources
    const { data: sourceData } = await supabase
      .from('quote_analytics_events')
      .select('session_id, referrer, utm_source, utm_medium, source_tag')
      .eq('event_type', 'quote_step_enter')
      .gte('created_at', startDateISO)

    const sourceBreakdown: Record<string, number> = {}
    const mediumBreakdown: Record<string, number> = {}
    const referrerBreakdown: Record<string, number> = {}
    const sourceTagBreakdown: Record<string, number> = {}
    const seenSessions = new Set<string>()

    ;(sourceData || []).forEach((row: any) => {
      if (seenSessions.has(row.session_id)) return
      seenSessions.add(row.session_id)

      const utm = row.utm_source || 'organic'
      const medium = row.utm_medium || 'unknown'
      sourceBreakdown[utm] = (sourceBreakdown[utm] || 0) + 1
      mediumBreakdown[medium] = (mediumBreakdown[medium] || 0) + 1

      if (row.source_tag) {
        sourceTagBreakdown[row.source_tag] = (sourceTagBreakdown[row.source_tag] || 0) + 1
      }

      if (row.referrer) {
        try {
          const refUrl = new URL(row.referrer)
          const domain = refUrl.hostname.replace('www.', '')
          referrerBreakdown[domain] = (referrerBreakdown[domain] || 0) + 1
        } catch {
          referrerBreakdown[row.referrer] = (referrerBreakdown[row.referrer] || 0) + 1
        }
      } else {
        referrerBreakdown['direct'] = (referrerBreakdown['direct'] || 0) + 1
      }
    })

    // 5. Time per step (average time between step enters)
    const { data: timeData } = await supabase
      .from('quote_analytics_events')
      .select('session_id, event_type, event_data, created_at')
      .in('event_type', ['quote_step_enter', 'quote_form_submit'])
      .gte('created_at', startDateISO)
      .order('created_at', { ascending: true })

    // Group by session, then calculate time between consecutive step enters
    const sessionTimes: Record<string, any[]> = {}
    ;(timeData || []).forEach((row: any) => {
      if (!sessionTimes[row.session_id]) sessionTimes[row.session_id] = []
      sessionTimes[row.session_id].push(row)
    })

    const stepTimes: Record<number, number[]> = {}
    for (let i = 1; i <= 5; i++) stepTimes[i] = []

    Object.values(sessionTimes).forEach((events) => {
      const stepEnters = events.filter(e => e.event_type === 'quote_step_enter')
      stepEnters.forEach((evt, idx) => {
        const step = evt.event_data?.step || 1
        if (idx < stepEnters.length - 1) {
          const next = stepEnters[idx + 1]
          const diff = new Date(next.created_at).getTime() - new Date(evt.created_at).getTime()
          if (diff > 0 && diff < 600000) { // cap at 10 minutes
            if (step >= 1 && step <= 5) stepTimes[step].push(diff)
          }
        }
      })
      // Time from last step enter to form submit
      const lastStep = stepEnters[stepEnters.length - 1]
      const formSubmit = events.find(e => e.event_type === 'quote_form_submit')
      if (lastStep && formSubmit) {
        const diff = new Date(formSubmit.created_at).getTime() - new Date(lastStep.created_at).getTime()
        if (diff > 0 && diff < 600000) {
          const step = lastStep.event_data?.step || 5
          if (step >= 1 && step <= 5) stepTimes[step].push(diff)
        }
      }
    })

    const avgStepTimes: Record<number, { avg_ms: number; median_ms: number; count: number; label: string }> = {}
    for (let i = 1; i <= 5; i++) {
      const times = stepTimes[i].sort((a, b) => a - b)
      const avg = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0
      const median = times.length > 0 ? times[Math.floor(times.length / 2)] : 0
      avgStepTimes[i] = {
        avg_ms: avg,
        median_ms: median,
        count: times.length,
        label: ['', 'Category', 'Brand', 'Model', 'Repair', 'Quote Details'][i],
      }
    }

    // 6. Popular device/repair combos (from form submit events)
    const { data: popularData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_form_submit')
      .gte('created_at', startDateISO)

    const popularCombos: Record<string, number> = {}
    const popularCategories: Record<string, number> = {}
    const popularBrands: Record<string, number> = {}
    const popularRepairs: Record<string, number> = {}
    ;(popularData || []).forEach((row: any) => {
      const d = row.event_data || {}
      const cat = d.device_category || 'Unknown'
      const brand = d.device_make || 'Unknown'
      const repair = d.repair_type || 'Unknown'
      popularCategories[cat] = (popularCategories[cat] || 0) + 1
      popularBrands[brand] = (popularBrands[brand] || 0) + 1
      popularRepairs[repair] = (popularRepairs[repair] || 0) + 1
      const combo = `${cat} → ${brand} → ${d.device_model || 'Unknown'} → ${repair}`
      popularCombos[combo] = (popularCombos[combo] || 0) + 1
    })

    // 7. Search queries
    const { data: searchData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_search')
      .gte('created_at', startDateISO)

    const searchQueries: Record<string, { count: number; zero_results: number }> = {}
    ;(searchData || []).forEach((row: any) => {
      const query = (row.event_data?.query || '').toLowerCase().trim()
      if (!query) return
      if (!searchQueries[query]) searchQueries[query] = { count: 0, zero_results: 0 }
      searchQueries[query].count++
      if (row.event_data?.result_count === 0) searchQueries[query].zero_results++
    })

    // 8. Additional repairs uptake
    const { data: addonData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_additional_repair_added')
      .gte('created_at', startDateISO)

    const addonBreakdown: Record<string, number> = {}
    let totalAddons = 0
    ;(addonData || []).forEach((row: any) => {
      const repair = row.event_data?.repair || 'unknown'
      addonBreakdown[repair] = (addonBreakdown[repair] || 0) + 1
      totalAddons++
    })

    // 9. Device type breakdown
    const { data: deviceData } = await supabase
      .from('quote_analytics_events')
      .select('session_id, is_mobile')
      .eq('event_type', 'quote_step_enter')
      .gte('created_at', startDateISO)

    const deviceSessions = new Set<string>()
    let mobileCount = 0
    let desktopCount = 0
    ;(deviceData || []).forEach((row: any) => {
      if (deviceSessions.has(row.session_id)) return
      deviceSessions.add(row.session_id)
      if (row.is_mobile) mobileCount++
      else desktopCount++
    })

    // 10. Accept page funnel
    const { data: acceptData } = await supabase
      .from('quote_analytics_events')
      .select('event_type, session_id')
      .in('event_type', ['quote_accept_page_view', 'quote_accept_clicked'])
      .gte('created_at', startDateISO)

    const acceptViews = new Set<string>()
    const acceptClicks = new Set<string>()
    ;(acceptData || []).forEach((row: any) => {
      if (row.event_type === 'quote_accept_page_view') acceptViews.add(row.session_id)
      if (row.event_type === 'quote_accept_clicked') acceptClicks.add(row.session_id)
    })

    // 11. Total unique sessions
    const totalSessions = seenSessions.size || deviceSessions.size

    // 12. Form errors
    const { data: errorData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_form_error')
      .gte('created_at', startDateISO)

    const formErrors: Record<string, number> = {}
    ;(errorData || []).forEach((row: any) => {
      const field = row.event_data?.field || 'unknown'
      formErrors[field] = (formErrors[field] || 0) + 1
    })

    // 13. Budget vs quoted price
    const { data: budgetData } = await supabase
      .from('quote_analytics_events')
      .select('event_data')
      .eq('event_type', 'quote_budget_submitted')
      .gte('created_at', startDateISO)

    const budgetComparisons: Array<{ budget: number; quoted_price: number | null }> = []
    ;(budgetData || []).forEach((row: any) => {
      budgetComparisons.push({
        budget: row.event_data?.budget || 0,
        quoted_price: row.event_data?.quoted_price || null,
      })
    })

    // Sort helper
    const sortDesc = (obj: Record<string, number>) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1])

    return NextResponse.json({
      success: true,
      period_days: days,
      total_sessions: totalSessions,
      funnel: {
        steps: stepFunnel,
        actions: {
          Form_Started: stepSessions['quote_form_start'].size,
          Form_Submitted: stepSessions['quote_form_submit'].size,
          Quote_Revealed: stepSessions['quote_reveal'].size,
          Action_Clicked: stepSessions['quote_action_click'].size,
        },
      },
      action_breakdown: sortDesc(actionBreakdown),
      hesitation_breakdown: sortDesc(hesitationBreakdown),
      traffic_sources: {
        utm_sources: sortDesc(sourceBreakdown),
        utm_mediums: sortDesc(mediumBreakdown),
        source_tags: sortDesc(sourceTagBreakdown),
        referrers: sortDesc(referrerBreakdown),
      },
      avg_step_times: avgStepTimes,
      popular: {
        categories: sortDesc(popularCategories),
        brands: sortDesc(popularBrands),
        repairs: sortDesc(popularRepairs),
        combos: sortDesc(popularCombos).slice(0, 20),
      },
      search_queries: Object.entries(searchQueries)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30)
        .map(([query, data]) => ({ query, ...data })),
      additional_repairs: {
        total_added: totalAddons,
        breakdown: sortDesc(addonBreakdown),
      },
      device_breakdown: { mobile: mobileCount, desktop: desktopCount },
      accept_page: {
        views: acceptViews.size,
        clicks: acceptClicks.size,
        conversion_rate: acceptViews.size > 0 ? Math.round((acceptClicks.size / acceptViews.size) * 100) : 0,
      },
      form_errors: sortDesc(formErrors),
      budget_comparisons: budgetComparisons,
    })
  } catch (error) {
    console.error('Analytics summary error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
