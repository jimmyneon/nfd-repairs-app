import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
const state = vi.hoisted(() => ({ auth: false, fail: false, filters: [] as string[], calls: 0 }))
vi.mock('@/lib/api-auth', () => ({ requireStaffUser: async () => ({ response: state.auth ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) : null }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  state.calls++
  const query: any = {
    select: () => query, eq: () => query, order: () => query,
    gte: (field: string, value: string) => { state.filters.push(`${table}:gte:${field}:${value}`); return query },
    lt: (field: string, value: string) => { state.filters.push(`${table}:lt:${field}:${value}`); return query },
    range: async () => ({ data: [], error: state.fail ? { message: 'Query failed' } : null }),
  }
  return query
} }) }))
import { GET } from '../app/api/analytics/summary/route'

beforeEach(() => {
  state.auth = false; state.fail = false; state.filters = []; state.calls = 0
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
