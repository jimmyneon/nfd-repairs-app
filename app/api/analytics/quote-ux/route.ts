import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffUser } from '@/lib/api-auth'
import { reportRange, readAllPages, VISIT_GAP_MS } from '@/lib/quote-analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type EventRow = {
  id: string
  session_id: string
  event_type: string
  event_data: Record<string, any> | null
  created_at: string
}

type Visit = { sessionId: string; events: EventRow[] }

const granularTypes = new Set([
  'quote_instrumentation_ready',
  'quote_category_selected',
  'quote_brand_selected',
  'quote_model_help_opened',
  'quote_model_selected',
  'quote_model_unlisted',
  'quote_repair_selected',
  'quote_repair_help_used',
  'quote_catalogue_ready',
  'quote_catalogue_timeout',
])

function splitVisits(events: EventRow[]): Visit[] {
  const bySession = new Map<string, EventRow[]>()
  for (const event of events) {
    if (!event.session_id) continue
    const group = bySession.get(event.session_id) || []
    group.push(event)
    bySession.set(event.session_id, group)
  }

  const visits: Visit[] = []
  for (const [sessionId, group] of bySession) {
    group.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    let current: EventRow[] = []
    for (const event of group) {
      if (current.length && Date.parse(event.created_at) - Date.parse(current[current.length - 1].created_at) >= VISIT_GAP_MS) {
        visits.push({ sessionId, events: current })
        current = []
      }
      current.push(event)
    }
    if (current.length) visits.push({ sessionId, events: current })
  }
  return visits
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index]
}

export async function GET(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    let range: ReturnType<typeof reportRange>
    try {
      range = reportRange(request.nextUrl.searchParams)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const lookback = new Date(Date.parse(range.startISO) - VISIT_GAP_MS).toISOString()
    const events = await readAllPages<EventRow>((from, to) => supabase
      .from('quote_analytics_events')
      .select('id, session_id, event_type, event_data, created_at')
      .gte('created_at', lookback)
      .lt('created_at', range.endISO)
      .order('created_at')
      .order('id')
      .range(from, to))

    const firstGranular = events
      .filter(event => granularTypes.has(event.event_type) && Date.parse(event.created_at) >= Date.parse(range.startISO))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0]

    if (!firstGranular) {
      return NextResponse.json({
        success: true,
        range: { start: range.start, end: range.end, timezone: range.timezone },
        instrumentation_active: false,
        instrumentation_started_at: null,
        visits: null,
        catalogue: null,
        help: null,
      })
    }

    const instrumentationStart = Date.parse(firstGranular.created_at)
    // Include a short lead-in so the step-1 event fired just before DOMContentLoaded
    // stays attached to the first instrumented visit.
    const relevantEvents = events.filter(event => Date.parse(event.created_at) >= instrumentationStart - 60_000)
    const visits = splitVisits(relevantEvents)

    const has = (visit: Visit, type: string) => visit.events.some(event => event.event_type === type)
    const hasStep = (visit: Visit, step: number) => visit.events.some(event => event.event_type === 'quote_step_enter' && Number(event.event_data?.step) === step)

    const instrumentedVisits = visits.filter(visit => has(visit, 'quote_instrumentation_ready'))
    const started = instrumentedVisits.filter(visit => hasStep(visit, 1))
    const categorySelected = started.filter(visit => has(visit, 'quote_category_selected'))
    const brandSelected = started.filter(visit => has(visit, 'quote_brand_selected'))
    const modelSelected = started.filter(visit => has(visit, 'quote_model_selected'))
    const repairSelected = started.filter(visit => has(visit, 'quote_repair_selected'))
    const quoteReached = started.filter(visit => has(visit, 'quote_reveal'))
    const submitted = started.filter(visit => has(visit, 'quote_form_submit'))

    const beforeReadyVisits = started.filter(visit => visit.events.some(event =>
      event.event_type === 'quote_category_selected' && event.event_data?.catalogue_ready === false))
    const beforeReadyProgressed = beforeReadyVisits.filter(visit => has(visit, 'quote_brand_selected'))

    const readyEvents = relevantEvents.filter(event => event.event_type === 'quote_catalogue_ready')
    const loadMs = readyEvents
      .map(event => Number(event.event_data?.load_ms))
      .filter(value => Number.isFinite(value) && value >= 0)
    const transferSizes = readyEvents
      .map(event => Number(event.event_data?.transfer_size))
      .filter(value => Number.isFinite(value) && value >= 0)
    const decodedSizes = readyEvents
      .map(event => Number(event.event_data?.decoded_body_size))
      .filter(value => Number.isFinite(value) && value >= 0)

    const modelHelpVisits = instrumentedVisits.filter(visit => has(visit, 'quote_model_help_opened')).length
    const modelUnlistedVisits = instrumentedVisits.filter(visit => has(visit, 'quote_model_unlisted')).length
    const repairHelpVisits = instrumentedVisits.filter(visit => has(visit, 'quote_repair_help_used')).length

    return NextResponse.json({
      success: true,
      range: { start: range.start, end: range.end, timezone: range.timezone },
      instrumentation_active: true,
      instrumentation_started_at: firstGranular.created_at,
      visits: {
        started: started.length,
        category_selected: categorySelected.length,
        no_category_selection: Math.max(0, started.length - categorySelected.length),
        brand_selected: brandSelected.length,
        model_selected: modelSelected.length,
        repair_selected: repairSelected.length,
        quote_reached: quoteReached.length,
        submitted: submitted.length,
        category_selected_while_loading: beforeReadyVisits.length,
        category_loading_then_progressed: beforeReadyProgressed.length,
      },
      catalogue: {
        ready_events: readyEvents.length,
        timeout_events: relevantEvents.filter(event => event.event_type === 'quote_catalogue_timeout').length,
        avg_load_ms: loadMs.length ? Math.round(loadMs.reduce((sum, value) => sum + value, 0) / loadMs.length) : 0,
        median_load_ms: percentile(loadMs, 0.5),
        p90_load_ms: percentile(loadMs, 0.9),
        avg_transfer_bytes: transferSizes.length ? Math.round(transferSizes.reduce((sum, value) => sum + value, 0) / transferSizes.length) : 0,
        avg_decoded_bytes: decodedSizes.length ? Math.round(decodedSizes.reduce((sum, value) => sum + value, 0) / decodedSizes.length) : 0,
      },
      help: {
        model_help_opened: modelHelpVisits,
        model_unlisted: modelUnlistedVisits,
        repair_help_used: repairHelpVisits,
      },
    })
  } catch (error) {
    console.error('Quote UX analytics error:', error)
    return NextResponse.json({ error: 'Failed to load quote UX analytics' }, { status: 500 })
  }
}
