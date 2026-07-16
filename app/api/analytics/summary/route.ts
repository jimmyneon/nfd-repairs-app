import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function emptyResponse(days: number, tableMissing = false) {
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
    exit_intent: { sessions: 0, total_events: 0 },
    abandonment: { by_step: [], total_abandoned: 0 },
    back_navigation: [],
    start_again: { sessions: 0, by_step: [] },
    option_selections: { total: 0, breakdown: [] },
    conversion_rate: 0,
    table_missing: tableMissing,
  })
}

export async function GET(request: NextRequest) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error', details: 'Missing Supabase environment variables' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

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
      console.error('Analytics table check error:', tableCheckError.message)
      return emptyResponse(days, true)
    }

    // Run all queries in parallel for speed
    const [
      funnelRes, stepEnterRes, actionRes, hesitationRes, sourceRes,
      timeRes, popularRes, searchRes, addonRes, deviceRes,
      acceptRes, errorRes, budgetRes,
      exitIntentRes, backNavRes, startAgainRes, optionSelectedRes,
    ] = await Promise.all([
      supabase.from('quote_analytics_events').select('event_type, session_id').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_data').eq('event_type', 'quote_step_enter').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_action_click').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_hesitation_reason').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, referrer, utm_source, utm_medium, source_tag').eq('event_type', 'quote_step_enter').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_type, event_data, created_at').in('event_type', ['quote_step_enter', 'quote_form_submit']).gte('created_at', startDateISO).order('created_at', { ascending: true }),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_form_submit').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_search').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_additional_repair_added').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, is_mobile').eq('event_type', 'quote_step_enter').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_type, session_id').in('event_type', ['quote_accept_page_view', 'quote_accept_clicked']).gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_form_error').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('event_data').eq('event_type', 'quote_budget_submitted').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_data').eq('event_type', 'quote_exit_intent').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_data').eq('event_type', 'quote_back_navigation').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_data').eq('event_type', 'quote_start_again').gte('created_at', startDateISO),
      supabase.from('quote_analytics_events').select('session_id, event_data').eq('event_type', 'quote_option_selected').gte('created_at', startDateISO),
    ])

    // Helper: safely get array from Supabase response
    const arr = (res: { data: any[] | null }): any[] => Array.isArray(res?.data) ? res.data : []

    const funnelData = arr(funnelRes)
    const stepEnterData = arr(stepEnterRes)
    const actionData = arr(actionRes)
    const hesitationData = arr(hesitationRes)
    const sourceData = arr(sourceRes)
    const timeData = arr(timeRes)
    const popularData = arr(popularRes)
    const searchData = arr(searchRes)
    const addonData = arr(addonRes)
    const deviceData = arr(deviceRes)
    const acceptData = arr(acceptRes)
    const errorData = arr(errorRes)
    const budgetData = arr(budgetRes)
    const exitIntentData = arr(exitIntentRes)
    const backNavData = arr(backNavRes)
    const startAgainData = arr(startAgainRes)
    const optionSelectedData = arr(optionSelectedRes)

    // Build funnel counts
    const funnelSteps = ['quote_step_enter', 'quote_form_start', 'quote_form_submit', 'quote_reveal', 'quote_action_click']

    const stepSessions: Record<string, Set<string>> = {}
    for (const s of funnelSteps) { stepSessions[s] = new Set() }

    for (const row of funnelData) {
      if (row.event_type === 'quote_step_enter') {
        stepSessions['quote_step_enter'].add(row.session_id)
      } else if (stepSessions[row.event_type]) {
        stepSessions[row.event_type].add(row.session_id)
      }
    }

    // Step-level funnel (step 1 through 5)
    const stepFunnel: Record<number, { count: number; label: string }> = {}
    const stepSessionSets: Record<number, Set<string>> = {}
    for (let i = 1; i <= 5; i++) {
      stepSessionSets[i] = new Set()
      stepFunnel[i] = { count: 0, label: ['', 'Category', 'Brand', 'Model', 'Repair', 'Quote Details'][i] }
    }
    for (const row of stepEnterData) {
      const stepNum = row.event_data?.step || 1
      if (stepNum >= 1 && stepNum <= 5) {
        stepSessionSets[stepNum].add(row.session_id)
      }
    }
    for (let i = 1; i <= 5; i++) {
      stepFunnel[i].count = stepSessionSets[i].size
    }

    // 2. Action breakdown
    const actionBreakdown: Record<string, number> = {}
    for (const row of actionData) {
      const action = row.event_data?.action || 'unknown'
      actionBreakdown[action] = (actionBreakdown[action] || 0) + 1
    }

    // 3. Hesitation reasons
    const hesitationBreakdown: Record<string, number> = {}
    for (const row of hesitationData) {
      const reason = row.event_data?.reason || 'unknown'
      hesitationBreakdown[reason] = (hesitationBreakdown[reason] || 0) + 1
    }

    // 4. Traffic sources
    const sourceBreakdown: Record<string, number> = {}
    const mediumBreakdown: Record<string, number> = {}
    const referrerBreakdown: Record<string, number> = {}
    const sourceTagBreakdown: Record<string, number> = {}
    const seenSessions = new Set<string>()

    for (const row of sourceData) {
      if (seenSessions.has(row.session_id)) continue
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
    }

    // 5. Time per step
    const sessionTimes: Record<string, any[]> = {}
    for (const row of timeData) {
      if (!sessionTimes[row.session_id]) sessionTimes[row.session_id] = []
      sessionTimes[row.session_id].push(row)
    }

    const stepTimes: Record<number, number[]> = {}
    for (let i = 1; i <= 5; i++) stepTimes[i] = []

    for (const events of Object.values(sessionTimes)) {
      const stepEnters = events.filter(e => e.event_type === 'quote_step_enter')
      for (let idx = 0; idx < stepEnters.length; idx++) {
        const evt = stepEnters[idx]
        const step = evt.event_data?.step || 1
        if (idx < stepEnters.length - 1) {
          const next = stepEnters[idx + 1]
          const diff = new Date(next.created_at).getTime() - new Date(evt.created_at).getTime()
          if (diff > 0 && diff < 600000) {
            if (step >= 1 && step <= 5) stepTimes[step].push(diff)
          }
        }
      }
      const lastStep = stepEnters[stepEnters.length - 1]
      const formSubmit = events.find(e => e.event_type === 'quote_form_submit')
      if (lastStep && formSubmit) {
        const diff = new Date(formSubmit.created_at).getTime() - new Date(lastStep.created_at).getTime()
        if (diff > 0 && diff < 600000) {
          const step = lastStep.event_data?.step || 5
          if (step >= 1 && step <= 5) stepTimes[step].push(diff)
        }
      }
    }

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

    // 6. Popular device/repair combos
    const popularCombos: Record<string, number> = {}
    const popularCategories: Record<string, number> = {}
    const popularBrands: Record<string, number> = {}
    const popularRepairs: Record<string, number> = {}
    for (const row of popularData) {
      const d = row.event_data || {}
      const cat = d.device_category || 'Unknown'
      const brand = d.device_make || 'Unknown'
      const repair = d.repair_type || 'Unknown'
      popularCategories[cat] = (popularCategories[cat] || 0) + 1
      popularBrands[brand] = (popularBrands[brand] || 0) + 1
      popularRepairs[repair] = (popularRepairs[repair] || 0) + 1
      const combo = `${cat} → ${brand} → ${d.device_model || 'Unknown'} → ${repair}`
      popularCombos[combo] = (popularCombos[combo] || 0) + 1
    }

    // 7. Search queries
    const searchQueries: Record<string, { count: number; zero_results: number }> = {}
    for (const row of searchData) {
      const query = (row.event_data?.query || '').toLowerCase().trim()
      if (!query) continue
      if (!searchQueries[query]) searchQueries[query] = { count: 0, zero_results: 0 }
      searchQueries[query].count++
      if (row.event_data?.result_count === 0) searchQueries[query].zero_results++
    }

    // 8. Additional repairs uptake
    const addonBreakdown: Record<string, number> = {}
    let totalAddons = 0
    for (const row of addonData) {
      const repair = row.event_data?.repair || 'unknown'
      addonBreakdown[repair] = (addonBreakdown[repair] || 0) + 1
      totalAddons++
    }

    // 9. Device type breakdown
    const deviceSessions = new Set<string>()
    let mobileCount = 0
    let desktopCount = 0
    for (const row of deviceData) {
      if (deviceSessions.has(row.session_id)) continue
      deviceSessions.add(row.session_id)
      if (row.is_mobile) mobileCount++
      else desktopCount++
    }

    // 10. Accept page funnel
    const acceptViews = new Set<string>()
    const acceptClicks = new Set<string>()
    for (const row of acceptData) {
      if (row.event_type === 'quote_accept_page_view') acceptViews.add(row.session_id)
      if (row.event_type === 'quote_accept_clicked') acceptClicks.add(row.session_id)
    }

    // 11. Total unique sessions
    const totalSessions = seenSessions.size || deviceSessions.size

    // 12. Form errors
    const formErrors: Record<string, number> = {}
    for (const row of errorData) {
      const field = row.event_data?.field || 'unknown'
      formErrors[field] = (formErrors[field] || 0) + 1
    }

    // 13. Budget vs quoted price
    const budgetComparisons: Array<{ budget: number; quoted_price: number | null }> = []
    for (const row of budgetData) {
      budgetComparisons.push({
        budget: row.event_data?.budget || 0,
        quoted_price: row.event_data?.quoted_price || null,
      })
    }

    // 14. Exit intent & abandonment
    const exitIntentSessions = new Set<string>()
    for (const row of exitIntentData) {
      exitIntentSessions.add(row.session_id)
    }

    // Find the last step each session reached (for abandonment analysis)
    const lastStepBySession: Record<string, number> = {}
    for (const row of stepEnterData) {
      const stepNum = row.event_data?.step || 1
      const sid = row.session_id
      if (!lastStepBySession[sid] || stepNum > lastStepBySession[sid]) {
        lastStepBySession[sid] = stepNum
      }
    }
    // Count how many sessions abandoned at each step
    const abandonmentByStep: Record<number, number> = {}
    for (const sid of Object.keys(lastStepBySession)) {
      const lastStep = lastStepBySession[sid]
      // Only count as abandoned if they didn't submit the form
      if (!stepSessions['quote_form_submit'].has(sid)) {
        abandonmentByStep[lastStep] = (abandonmentByStep[lastStep] || 0) + 1
      }
    }

    // 15. Back navigation
    const backNavBreakdown: Record<string, number> = {}
    for (const row of backNavData) {
      const fromStep = row.event_data?.from_step || '?'
      const toStep = row.event_data?.to_step || '?'
      const key = `Step ${fromStep} → Step ${toStep}`
      backNavBreakdown[key] = (backNavBreakdown[key] || 0) + 1
    }

    // 16. Start again
    const startAgainSessions = new Set<string>()
    const startAgainByStep: Record<number, number> = {}
    for (const row of startAgainData) {
      startAgainSessions.add(row.session_id)
      const step = row.event_data?.current_step || 1
      startAgainByStep[step] = (startAgainByStep[step] || 0) + 1
    }

    // 17. Quote option selections
    const optionBreakdown: Record<string, number> = {}
    let totalOptionsSelected = 0
    for (const row of optionSelectedData) {
      const d = row.event_data || {}
      const key = d.quote_key || d.option_label || 'unknown'
      optionBreakdown[key] = (optionBreakdown[key] || 0) + 1
      totalOptionsSelected++
    }

    // 18. Overall conversion rate
    const formSubmitCount = stepSessions['quote_form_submit'].size
    const overallConversionRate = totalSessions > 0 ? Math.round((formSubmitCount / totalSessions) * 100) : 0

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
      exit_intent: {
        sessions: exitIntentSessions.size,
        total_events: exitIntentData.length,
      },
      abandonment: {
        by_step: Object.entries(abandonmentByStep)
          .map(([step, count]) => ({ step: parseInt(step), label: ['', 'Category', 'Brand', 'Model', 'Repair', 'Quote Details'][parseInt(step)] || 'Unknown', count }))
          .sort((a, b) => a.step - b.step),
        total_abandoned: Object.values(abandonmentByStep).reduce((s, c) => s + c, 0),
      },
      back_navigation: sortDesc(backNavBreakdown),
      start_again: {
        sessions: startAgainSessions.size,
        by_step: Object.entries(startAgainByStep)
          .map(([step, count]) => ({ step: parseInt(step), label: ['', 'Category', 'Brand', 'Model', 'Repair', 'Quote Details'][parseInt(step)] || 'Unknown', count }))
          .sort((a, b) => a.step - b.step),
      },
      option_selections: {
        total: totalOptionsSelected,
        breakdown: sortDesc(optionBreakdown),
      },
      conversion_rate: overallConversionRate,
    })
  } catch (error) {
    console.error('Analytics summary error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
