import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
const state = vi.hoisted(() => ({ auth: false, fail: false, filters: [] as string[], calls: 0, rows: {} as Record<string, any[]> }))
vi.mock('@/lib/api-auth', () => ({ requireStaffUser: async () => ({ response: state.auth ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) : null }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  state.calls++
  const filters: Array<(row: any) => boolean> = []
  const query: any = {
    select: () => query, eq: () => query, order: () => query,
    in: (field: string, values: any[]) => { filters.push(row => values.includes(row[field])); return query },
    gte: (field: string, value: string) => { state.filters.push(`${table}:gte:${field}:${value}`); return query },
    lt: (field: string, value: string) => { state.filters.push(`${table}:lt:${field}:${value}`); return query },
    range: async (from: number, to: number) => ({ data: (state.rows[table] || []).filter(row => filters.every(filter => filter(row))).slice(from, to + 1), error: state.fail ? { message: 'Query failed' } : null }),
  }
  return query
} }) }))
import { GET } from '../app/api/analytics/summary/route'
import { GET as getUx } from '../app/api/analytics/quote-ux/route'

beforeEach(() => {
  state.auth = false; state.fail = false; state.filters = []; state.calls = 0; state.rows = {}
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
})
describe('quote analytics API', () => {
  it('applies UK range bounds to events and enquiries and returns a complete empty overview', async () => {
    const response = await GET(new NextRequest('http://localhost/api/analytics/summary?start=2026-03-29&end=2026-03-29'))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.overview.unique_visitors).toBe(0)
    expect(data.overview.daily).toEqual([{ date: '2026-03-29', visitors: 0, visits: 0 }])
    expect(state.filters).toContain('enquiries:gte:created_at:2026-03-29T00:00:00.000Z')
    expect(state.filters).toContain('enquiries:lt:created_at:2026-03-29T23:00:00.000Z')
    expect(state.filters).toContain('quote_analytics_events:lt:created_at:2026-03-29T23:00:00.000Z')
  })
  it('requires staff authentication before querying', async () => {
    state.auth = true
    expect((await GET(new NextRequest('http://localhost/api/analytics/summary'))).status).toBe(401)
    expect(state.calls).toBe(0)
  })
  it('returns invalid ranges as 400 without querying', async () => {
    expect((await GET(new NextRequest('http://localhost/api/analytics/summary?days=bad'))).status).toBe(400)
    expect(state.calls).toBe(0)
  })
  it('returns database errors instead of a misleading empty report', async () => {
    state.fail = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(new NextRequest('http://localhost/api/analytics/summary'))).status).toBe(500)
    spy.mockRestore()
  })
})


const uxRequest = () => new NextRequest('http://localhost/api/analytics/quote-ux?start=2026-03-29&end=2026-03-29')
function uxEvent(session: string, type: string, minute: number, ref: string | null = null, extra = {}) {
  return { id: `${session}-${type}-${minute}`, session_id: session, event_type: type, created_at: `2026-03-29T10:${String(minute).padStart(2, '0')}:00Z`, enquiry_ref: ref, event_data: { journey_mode: 'deep_link', ...extra } }
}
describe('quote UX commercial outcomes', () => {
  it('includes direct links, deduplicates repeated requests and joins every linked job in both directions', async () => {
    state.rows = {
      quote_analytics_events: [
        uxEvent('a', 'quote_instrumentation_ready', 0), uxEvent('a', 'quote_reveal', 1),
        uxEvent('a', 'repair_request_submitted', 2, 'REQ-1'),
        uxEvent('a', 'repair_request_submitted', 3, 'REQ-2'),
        uxEvent('a', 'not_ready_opened', 4, 'STALE-REF'),
        uxEvent('b', 'quote_instrumentation_ready', 5), uxEvent('b', 'repair_request_submitted', 6, 'REQ-1'),
        uxEvent('c', 'quote_instrumentation_ready', 7), uxEvent('c', 'repair_request_submitted', 8, 'MISSING'),
      ],
      enquiries: [ { id: 'e1', enquiry_ref: 'REQ-1', converted_job_id: 'j1' }, { id: 'e2', enquiry_ref: 'REQ-2', converted_job_id: 'j3' } ],
      jobs: [
        { id: 'j1', quote_request_id: 'e1', status: 'COMPLETED', payment_received: true },
        { id: 'j2', quote_request_id: 'e1', status: 'COLLECTED', payment_received: false },
        { id: 'j3', quote_request_id: null, status: 'DROPPED_OFF', payment_received: true },
        { id: 'unrelated', status: 'COMPLETED', payment_received: true },
      ],
    }
    const response = await getUx(uxRequest())
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.visits).toMatchObject({ started: 3, submitted: 3, no_category_selection: 0, category_entrants: 0 })
    expect(data.conversion.device_received).toBe(2)
    expect(data.conversion.routes[0]).toMatchObject({ mode: 'deep_link', visits: 3 })
    expect(data.outcomes).toEqual({ requests: 3, matched_requests: 2, unmatched_requests: 1, linked_jobs: 3, device_received: 3, completed: 2, completed_marked_paid: 1 })
  })
  it('keeps successful requests visible in the main dashboard funnel', async () => {
    state.rows.quote_analytics_events = [uxEvent('a', 'repair_request_submitted', 0, 'REQ-1'), uxEvent('a', 'quote_form_submit', 1, 'REQ-1')]
    const data = await (await GET(uxRequest())).json()
    expect(data.overview.submitted_visits).toBe(1)
    expect(data.funnel.actions.Form_Submitted).toBe(1)
  })
  it('keeps a resumed request after the visit timeout without a second page-load event', async () => {
    state.rows.quote_analytics_events = [uxEvent('a', 'repair_request_submitted', 45, 'REQ-1')]
    const data = await (await getUx(uxRequest())).json()
    expect(data.visits.started).toBe(1)
    expect(data.outcomes.requests).toBe(1)
  })
  it('does not count request references carried by non-submission events', async () => {
    state.rows.quote_analytics_events = [uxEvent('a', 'quote_instrumentation_ready', 0), uxEvent('a', 'quote_reveal', 1, 'OLD')]
    const data = await (await getUx(uxRequest())).json()
    expect(data.outcomes.requests).toBe(0)
    expect(data.conversion.device_received).toBe(0)
  })
  it('keeps staff access and database failures explicit', async () => {
    state.auth = true
    expect((await getUx(uxRequest())).status).toBe(401)
    expect(state.calls).toBe(0)
    state.auth = false; state.fail = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await getUx(uxRequest())).status).toBe(500)
    spy.mockRestore()
  })
})
