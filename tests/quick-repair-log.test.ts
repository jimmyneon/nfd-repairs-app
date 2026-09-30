import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuickRepairJob } from '../lib/quick-repair-log'

const state = vi.hoisted(() => ({
  authorised: true,
  fail: false,
  jobs: new Map<string, any>(),
  events: [] as any[],
  calls: 0,
}))
vi.mock('@/lib/api-auth', () => ({ requireStaffUser: async () => ({ response: state.authorised ? null : NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }) }))
vi.mock('@/lib/resilience', () => ({ createServiceClient: () => ({ from: (table: string) => {
  state.calls++
  let payload: any
  const filters: Record<string, unknown> = {}
  const query: any = {
    insert: (value: any) => {
      payload = value
      if (table === 'job_events') { state.events.push(value); return Promise.resolve({ error: null }) }
      return query
    },
    select: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query },
    single: async () => {
      if (state.fail) return { data: null, error: { message: 'Database unavailable' } }
      if (state.jobs.has(payload.id)) return { data: null, error: { code: '23505', message: 'duplicate jobs_pkey' } }
      const job = { ...payload, job_ref: `NFD-TEST-${state.jobs.size + 1}` }
      state.jobs.set(job.id, job)
      return { data: { id: job.id, job_ref: job.job_ref }, error: null }
    },
    maybeSingle: async () => {
      const job = state.jobs.get(filters.id as string)
      return { data: job?.source === filters.source ? { id: job.id, job_ref: job.job_ref } : null, error: null }
    },
  }
  return query
} }) }))

import { POST } from '../app/api/jobs/quick-log/route'
const id = 'fd2a7854-8bba-4f2e-8273-dac536cb6a42'
const payload = { id, device_type: 'phone', issue: 'Battery replacement', status: 'COMPLETED', amount: '55.00' }
const request = (body: unknown) => new NextRequest('http://localhost/api/jobs/quick-log', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => { state.authorised = true; state.fail = false; state.jobs.clear(); state.events = []; state.calls = 0 })

describe('quick repair log', () => {
  it('records an anonymous completed repair in the existing analytics without inventing consent or payment', async () => {
    expect((await POST(request(payload))).status).toBe(201)
    const job = state.jobs.get(id)
    expect(job).toMatchObject({ customer_phone: null, customer_email: null, type: 'repair', status: 'COMPLETED', price_total: 55, repair_outcome: 'repaired', terms_accepted: false, onboarding_completed: false, payment_received: false, device_in_shop: false, skip_review_request: true })
    expect(job.closed_at).toBeTruthy()
    expect(state.events).toHaveLength(1)
  })
  it('makes a repeated submission safe but allows two separate identical repairs', async () => {
    const first = await (await POST(request(payload))).json()
    const retry = await (await POST(request(payload))).json()
    expect(retry.job_ref).toBe(first.job_ref)
    expect(state.jobs.size).toBe(1)
    expect(state.events).toHaveLength(1)
    expect((await POST(request({ ...payload, id: 'f20feb6d-4e4f-48aa-8020-05e03e510c0d' }))).status).toBe(201)
    expect(state.jobs.size).toBe(2)
  })
  it('keeps unfinished work active rather than claiming a completed repair', () => {
    const job = buildQuickRepairJob({ ...payload, status: 'RECEIVED', amount: '' })
    expect(job).toMatchObject({ status: 'RECEIVED', device_in_shop: true, repair_outcome: null, closed_at: null, collected_at: null, price_total: 0 })
  })
  it('rejects unauthenticated callers before touching the database', async () => {
    state.authorised = false
    expect((await POST(request(payload))).status).toBe(401)
    expect(state.calls).toBe(0)
  })
  it.each([{ device_type: '' }, { issue: ' ' }, { amount: '-5' }, { amount: '1.234' }, { status: 'QUOTE_APPROVED' }, { id: 'bad' }])('rejects invalid details: %o', async invalid => {
    expect((await POST(request({ ...payload, ...invalid }))).status).toBe(400)
    expect(state.jobs.size).toBe(0)
  })
  it('returns a save failure instead of claiming success', async () => {
    state.fail = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(request(payload))).status).toBe(500)
    expect(state.jobs.size).toBe(0)
    spy.mockRestore()
  })
})
