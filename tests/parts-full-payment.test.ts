import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), constructEvent: vi.fn() }))
vi.mock('@/lib/resilience', () => ({ createServiceClient: mocks.createClient, sendSms: vi.fn(), isSmsConfigured: () => false }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }) }))
import { POST } from '@/app/api/webhooks/stripe/route'

describe('full repair payment satisfies parts deposit', () => {
  let event: any
  let updates: any[]
  let paidAmount: number
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-secret')
    updates = []
    paidAmount = 10000
    event = { type: 'checkout.session.completed', data: { object: { id: 'test-session', payment_status: 'paid', amount_total: 10000, metadata: { kind: 'job_payment', job_id: 'test-job' } } } }
    mocks.constructEvent.mockImplementation(() => event)
    mocks.createClient.mockReturnValue({ from: (table: string) => {
      let isUpdate = false
      const query: any = {
        select: () => query, eq: () => query, or: () => query,
        update: (values: any) => { isUpdate = true; updates.push({table, values}); return query },
        insert: () => query,
        single: async () => ({ data: {price_total:100, deposit_required:true} }),
        maybeSingle: async () => ({data:null}),
        then: (resolve: any) => Promise.resolve({ data: table === 'payments' ? isUpdate ? [{id:'test-payment',kind:'job_payment',job_id:'test-job',amount_pence:paidAmount}] : [{amount_pence:paidAmount}] : null, error:null }).then(resolve),
      }
      return query
    } })
  })
  afterEach(() => vi.unstubAllEnvs())
  const send = () => POST(new NextRequest('https://example.test/api/webhooks/stripe', {method:'POST',headers:{'stripe-signature':'test'},body:'test-event'}))
  it('marks full payment and deposit satisfied after settled payment', async () => {
    expect((await send()).status).toBe(200)
    expect(updates.find(update => update.table === 'jobs').values).toMatchObject({payment_received:true,deposit_received:true})
  })
  it('does not fulfil an unpaid completed checkout', async () => {
    event.data.object.payment_status = 'unpaid'
    await send()
    expect(updates).toEqual([])
  })
  it('fulfils delayed payment when Stripe confirms success', async () => {
    event.type = 'checkout.session.async_payment_succeeded'
    await send()
    expect(updates.find(update => update.table === 'jobs').values.deposit_received).toBe(true)
  })
  it('does not mark a partial payment as fully paid', async () => {
    paidAmount = 2000
    await send()
    expect(updates.some(update => update.table === 'jobs')).toBe(false)
  })
})
