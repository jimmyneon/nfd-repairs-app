import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffUser } from '@/lib/api-auth'
import { reportRange, readAllPages, VISIT_GAP_MS, quoteJobHasDeviceArrived } from '@/lib/quote-analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type EventRow = {
  id: string
  session_id: string
  event_type: string
  enquiry_ref: string | null
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
      .select('id, session_id, enquiry_ref, event_type, event_data, created_at')
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
    const routeMode = (visit: Visit) => {
      if (has(visit, 'quote_search_result_selected')) return 'search'
      const explicit = [...visit.events].reverse().find(event => typeof event.event_data?.journey_mode === 'string')?.event_data?.journey_mode
      return ['guided', 'search', 'deep_link', 'restored'].includes(explicit) ? explicit : 'unknown'
    }

    const instrumentedVisits = visits.filter(visit => has(visit, 'quote_instrumentation_ready'))
    const started = instrumentedVisits.filter(visit => hasStep(visit, 1))
    const categorySelected = started.filter(visit => has(visit, 'quote_category_selected'))
    const brandSelected = started.filter(visit => has(visit, 'quote_brand_selected'))
    const modelSelected = started.filter(visit => has(visit, 'quote_model_selected'))
    const repairSelected = started.filter(visit => has(visit, 'quote_repair_selected'))
    const quoteReached = started.filter(visit => has(visit, 'quote_reveal'))
    const submitted = started.filter(visit => has(visit, 'quote_form_submit'))
    const repairStartClicked = started.filter(visit => has(visit, 'repair_start_clicked'))
    const repairRequestOpened = started.filter(visit => has(visit, 'repair_request_opened'))
    const repairRequestSubmitted = started.filter(visit => has(visit, 'repair_request_submitted'))
    const notReadyOpened = started.filter(visit => has(visit, 'not_ready_opened'))

    // Join submitted website requests to their eventual jobs so the commercial
    // funnel ends at the outcome that matters: the device reaching the workshop.
    const submittedRefs = [...new Set(
      relevantEvents
        .filter(event => event.event_type === 'repair_request_submitted' && event.enquiry_ref)
        .map(event => event.enquiry_ref as string)
    )]
    const submittedEnquiries: any[] = []
    for (let offset = 0; offset < submittedRefs.length; offset += 100) {
      const refs = submittedRefs.slice(offset, offset + 100)
      const rows = await readAllPages<any>((from, to) => supabase
        .from('enquiries')
        .select('id, enquiry_ref, converted_job_id, converted_to_job')
        .in('enquiry_ref', refs)
        .order('created_at')
        .order('id')
        .range(from, to))
      submittedEnquiries.push(...rows)
    }
    const enquiryByRef = new Map<string, any>()
    for (const enquiry of submittedEnquiries) {
      if (enquiry.enquiry_ref) enquiryByRef.set(enquiry.enquiry_ref, enquiry)
    }

    const enquiryIds = submittedEnquiries.map(enquiry => enquiry.id).filter(Boolean)
    const linkedJobs: any[] = []
    for (let offset = 0; offset < enquiryIds.length; offset += 100) {
      const ids = enquiryIds.slice(offset, offset + 100)
      const rows = await readAllPages<any>((from, to) => supabase
        .from('jobs')
        .select('id, quote_request_id, status, device_in_shop')
        .in('quote_request_id', ids)
        .order('created_at')
        .order('id')
        .range(from, to))
      linkedJobs.push(...rows)
    }
    const jobByEnquiry = new Map<string, any>()
    for (const job of linkedJobs) {
      if (job.quote_request_id) jobByEnquiry.set(job.quote_request_id, job)
    }
    const visitEnquiryRef = (visit: Visit) =>
      [...visit.events].reverse().find(event => event.enquiry_ref)?.enquiry_ref || null
    const visitHasDeviceArrived = (visit: Visit) => {
      const ref = visitEnquiryRef(visit)
      if (!ref) return false
      const enquiry = enquiryByRef.get(ref)
      return Boolean(enquiry && quoteJobHasDeviceArrived(jobByEnquiry.get(enquiry.id)))
    }
    const deviceReceived = started.filter(visit => visitHasDeviceArrived(visit))

    const routeNames = ['guided', 'search', 'deep_link', 'restored', 'unknown'] as const
    const routes = routeNames.map(mode => {
      const routeVisits = started.filter(visit => routeMode(visit) === mode)
      return {
        mode,
        visits: routeVisits.length,
        quote_reached: routeVisits.filter(visit => has(visit, 'quote_reveal')).length,
        repair_start_clicked: routeVisits.filter(visit => has(visit, 'repair_start_clicked')).length,
        repair_request_submitted: routeVisits.filter(visit => has(visit, 'repair_request_submitted')).length,
        device_received: routeVisits.filter(visit => visitHasDeviceArrived(visit)).length,
      }
    }).filter(route => route.visits > 0)

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
      conversion: {
        quote_reached: quoteReached.length,
        repair_start_clicked: repairStartClicked.length,
        repair_request_opened: repairRequestOpened.length,
        repair_request_submitted: repairRequestSubmitted.length,
        device_received: deviceReceived.length,
        not_ready_opened: notReadyOpened.length,
        routes,
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
