import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  sendSms: vi.fn(),
  smsConfigured: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/resilience', () => ({
  sendSms: mocks.sendSms,
  isSmsConfigured: mocks.smsConfigured,
}))

import { POST, pickBestJob } from '@/app/api/sms/reply/route'
import { linkOpenEnquiriesToJob } from '@/lib/enquiry-linking'

// ---------------------------------------------------------------------------
// Chainable Supabase mock — records filters/inserts/updates and resolves
// per-table canned data supplied by each test.
// ---------------------------------------------------------------------------
type State = {
  enquiries?: any[]
  jobs?: any[]
  workloadJobs?: any[]
  jobCount?: number
  staffSmsCount?: number
  approvalNoteCount?: number
  enquiriesError?: any
}

function makeSupabase(state: State, caps: Record<string, any[]>) {
  return {
    from(table: string) {
      const q: any = {
        _table: table,
        _eq: {} as Record<string, any>,
        _in: {} as Record<string, any>,
        _like: [] as [string, string][],
        _count: false,
        _inserted: null as any,
        _updated: null as any,
        select(_cols?: string, opts?: any) { if (opts?.count) q._count = true; return q },
        eq(col: string, val: any) { q._eq[col] = val; return q },
        neq(col: string, val: any) { q._eq[`!${col}`] = val; return q },
        in(col: string, vals: any[]) { q._in[col] = vals; return q },
        is(col: string, val: any) { q._eq[col] = val; return q },
        like(col: string, val: string) { q._like.push([col, val]); return q },
        ilike(col: string, val: string) { q._like.push([col, val]); return q },
        gte() { return q },
        lt() { return q },
        order() { return q },
        limit() { return q },
        insert(row: any) {
          q._inserted = row
          ;(caps[`${table}_inserts`] ||= []).push(row)
          return q
        },
        update(row: any) {
          q._updated = row
          ;(caps[`${table}_updates`] ||= []).push({ row, eq: q._eq })
          return q
        },
        delete() { return q },
        single() { return q._resolve(true) },
        maybeSingle() { return q._resolve(false) },
        then(onF: any, onR: any) { return q._result().then(onF, onR) },
        async _resolve(single: boolean) {
          const r = await q._result()
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error ?? null, count: r.count }
        },
        async _result() {
          if (q._inserted) {
            if (table === 'jobs') return { data: { id: 'job-new', ...q._inserted }, error: null }
            return { data: null, error: null }
          }
          if (q._updated) return { data: null, error: null }
          switch (table) {
            case 'enquiries':
              if (state.enquiriesError) return { data: null, error: state.enquiriesError }
              return { data: state.enquiries ?? [], error: null }
            case 'jobs':
              if (q._count) return { data: null, count: state.jobCount ?? 0, error: null }
              if (q._in.status) return { data: state.workloadJobs ?? [], error: null }
              return { data: state.jobs ?? [], error: null }
            case 'sms_logs':
              if (q._count) return { data: null, count: q._in.template_key ? 0 : (state.staffSmsCount ?? 0), error: null }
              return { data: [], error: null }
            case 'job_events': {
              if (!q._count) return { data: [], error: null }
              const like = q._like.map(([, v]) => v).join(' ')
              if (q._eq.type === 'NOTE' && like.includes('Customer approved the quote by SMS')) {
                return { data: null, count: state.approvalNoteCount ?? 0, error: null }
              }
              return { data: null, count: 0, error: null }
            }
            default:
              return { data: [], count: 0, error: null }
          }
        },
      }
      return q
    },
  }
}

const PHONE = '07957880541'
const DEVICE = 'MacBook Air Retina 13-inch (2018–2020 Intel)'

const realJob = () => ({
  id: 'job-real',
  job_ref: 'NFD-20261116-002',
  customer_name: 'Matt',
  customer_phone: PHONE,
  status: 'DIAGNOSTIC',
  device_make: 'Apple',
  device_model: DEVICE,
  device_in_shop: true,
  issue: 'Screen repair',
  short_token: 'abc123',
  tracking_token: 'track-token',
  created_at: '2026-11-16T10:00:00Z',
  updated_at: '2026-11-16T10:00:00Z',
  quote_request_id: null,
  review_platforms_completed: [],
})

const openEnquiry = (overrides: any = {}) => ({
  id: 'enq-1',
  enquiry_ref: 'ENQ-ZXZMV7ZW',
  enquiry_type: 'repair_quote',
  status: 'pending',
  customer_name: 'Matt',
  customer_phone: PHONE,
  device_make: 'Apple',
  device_model: DEVICE,
  created_at: '2026-11-15T10:00:00Z',
  ...overrides,
})

function post(phone: string, message: string) {
  return POST(new NextRequest('https://example.test/api/sms/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, message }),
  }))
}

describe('sms/reply routing', () => {
  let caps: Record<string, any[]>
  const setup = (state: State) => {
    caps = {}
    mocks.createClient.mockReturnValue(makeSupabase(state, caps))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sendSms.mockResolvedValue({ ok: true })
    mocks.smsConfigured.mockReturnValue(true)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('links a superseded open enquiry to the job and handles SMS quote approval (staff in conversation → no SMS)', async () => {
    setup({ enquiries: [openEnquiry()], jobs: [realJob()], staffSmsCount: 2 })

    const res = await post(PHONE, 'Please go ahead! Thank you')
    const json = await res.json()

    expect(json.routed_to).toBe('job_quote_approval')
    expect(json.job_ref).toBe('NFD-20261116-002')
    // Enquiry linked to the existing job — no duplicate job created
    expect(caps.jobs_inserts ?? []).toHaveLength(0)
    const enqUpdates = caps.enquiries_updates ?? []
    expect(enqUpdates.some(u => u.row.status === 'converted' && u.row.converted_job_id === 'job-real')).toBe(true)
    // Staff notification titled as a quote approval
    const notifs = caps.notifications_inserts ?? []
    expect(notifs.some(n => n.title?.startsWith('Quote approved:'))).toBe(true)
    // Approval NOTE recorded on the job
    const events = caps.job_events_inserts ?? []
    expect(events.some(e => e.type === 'NOTE' && e.message.includes('Customer approved the quote by SMS'))).toBe(true)
    // Staff already in conversation — no auto-SMS
    expect(mocks.sendSms).not.toHaveBeenCalled()
  })

  it('sends the approval acknowledgement when staff are not in conversation', async () => {
    setup({ enquiries: [openEnquiry()], jobs: [realJob()], staffSmsCount: 0 })

    const res = await post(PHONE, 'Please go ahead! Thank you')
    const json = await res.json()

    expect(json.routed_to).toBe('job_quote_approval')
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    const body = mocks.sendSms.mock.calls[0][1]
    expect(body).toContain("Thanks — that's noted")
    expect(body).not.toContain('bring it in')
    const logs = caps.sms_logs_inserts ?? []
    expect(logs.some(l => l.template_key === 'AUTO_QUOTE_APPROVAL_ACK')).toBe(true)
  })

  it('routes status queries to the in-shop job, not the newer duplicate, and acknowledges the approval', async () => {
    const dupJob = {
      id: 'job-dup',
      job_ref: 'NF-00002',
      customer_name: 'Matt',
      customer_phone: PHONE,
      status: 'QUOTE_APPROVED',
      device_make: 'Apple',
      device_model: DEVICE,
      device_in_shop: false,
      issue: 'Screen repair',
      short_token: 'dup123',
      tracking_token: 'dup-token',
      created_at: '2026-11-16T12:00:00Z',
      updated_at: '2026-11-16T12:00:00Z',
      quote_request_id: 'enq-1',
      review_platforms_completed: [],
    }
    const real = { ...realJob(), updated_at: '2026-11-16T11:00:00Z' }
    // jobs list is created_at desc — duplicate is newest
    setup({ enquiries: [], jobs: [dupJob, real], staffSmsCount: 0, approvalNoteCount: 1 })

    const res = await post(PHONE, 'When will it be ready to collect John?')
    const json = await res.json()

    expect(json.job_ref).toBe('NFD-20261116-002')
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    const body = mocks.sendSms.mock.calls[0][1]
    expect(body).toContain('thanks for approving the quote')
    expect(body).not.toContain('need your device')
    expect(body).not.toContain('parts in stock')
  })

  it('still auto-converts an enquiry that is newer than the job and for a different device', async () => {
    const enquiry = openEnquiry({
      device_model: 'iPhone 13',
      created_at: '2026-11-17T09:00:00Z', // after the job
    })
    setup({ enquiries: [enquiry], jobs: [realJob()], staffSmsCount: 0 })

    const res = await post(PHONE, 'yes please')
    const json = await res.json()

    expect(json.routed_to).toBe('enquiry_accept')
    expect(json.routed_to).not.toMatch(/^job_/)
    expect((caps.jobs_inserts ?? []).length).toBe(1)
  })

  it('never claims parts are in stock when the device is not here', async () => {
    const awaiting = { ...realJob(), status: 'AWAITING_DEVICE', device_in_shop: false }
    setup({ enquiries: [], jobs: [awaiting], staffSmsCount: 0 })

    const res = await post(PHONE, 'can I collect it?')
    await res.json()

    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    const body = mocks.sendSms.mock.calls[0][1]
    expect(body).toContain('we need your device first')
    expect(body).not.toContain('parts in stock')
  })
})

describe('pickBestJob', () => {
  it('prefers an active in-shop job over a newer not-in-shop job', () => {
    const dup = { id: 'dup', status: 'QUOTE_APPROVED', device_in_shop: false, created_at: '2026-11-16T12:00:00Z', updated_at: '2026-11-16T12:00:00Z' }
    const real = { id: 'real', status: 'DIAGNOSTIC', device_in_shop: true, created_at: '2026-11-16T10:00:00Z', updated_at: '2026-11-16T11:00:00Z' }
    expect(pickBestJob([dup, real]).id).toBe('real')
  })

  it('returns the newest job when all are completed/collected', () => {
    const older = { id: 'a', status: 'COLLECTED', created_at: '2026-11-10' }
    const newer = { id: 'b', status: 'COMPLETED', created_at: '2026-11-14' }
    expect(pickBestJob([newer, older]).id).toBe('b')
  })
})

describe('linkOpenEnquiriesToJob', () => {
  const makeSb = (state: State, caps: Record<string, any[]>) => makeSupabase(state, caps) as any

  it('links enquiries matching the device model and skips others', async () => {
    const caps: Record<string, any[]> = {}
    const sb = makeSb({
      enquiries: [
        { id: 'enq-1', enquiry_ref: 'ENQ-MATCH', device_model: 'iPhone 13', enquiry_type: 'repair_quote' },
        { id: 'enq-2', enquiry_ref: 'ENQ-OTHER', device_model: 'Galaxy S22', enquiry_type: 'repair_quote' },
      ],
    }, caps)
    const job = { id: 'job-1', job_ref: 'NFD-1', customer_phone: PHONE, device_model: 'iphone 13 ' }

    const refs = await linkOpenEnquiriesToJob(sb, job)
    expect(refs).toEqual(['ENQ-MATCH'])
    const updates = caps.enquiries_updates ?? []
    expect(updates).toHaveLength(1)
    expect(updates[0].row.converted_job_id).toBe('job-1')
    // quote_request_id backfilled on the job
    expect((caps.jobs_updates ?? [])[0]?.row.quote_request_id).toBe('enq-1')
  })

  it('returns [] without throwing when Supabase errors', async () => {
    const caps: Record<string, any[]> = {}
    const sb = makeSb({ enquiriesError: { message: 'boom' } }, caps)
    const job = { id: 'job-1', job_ref: 'NFD-1', customer_phone: PHONE, device_model: 'iPhone 13' }
    await expect(linkOpenEnquiriesToJob(sb, job)).resolves.toEqual([])
  })
})
