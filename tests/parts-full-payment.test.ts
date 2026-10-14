import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), constructEvent: vi.fn(), sendSms: vi.fn(), smsEnabled: vi.fn() }))
vi.mock('@/lib/resilience', () => ({ createServiceClient: mocks.createClient, sendSms: mocks.sendSms, isSmsConfigured: mocks.smsEnabled }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }) }))
import { POST } from '@/app/api/webhooks/stripe/route'

describe('full repair payment satisfies parts deposit', () => {
  let event: any
  let updates: any[]
  let paidAmount: number
  let job: any
  let redelivery: boolean
  let updateError: any
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-secret')
    updates = []
    paidAmount = 10000
    job = {price_total:100, deposit_required:true, customer_name:'Test', customer_phone:'07000000000', tracking_token:'test-token', short_token:'short123'}
    redelivery = false
    updateError = null
    mocks.smsEnabled.mockReturnValue(false)
    event = { type: 'checkout.session.completed', data: { object: { id: 'test-session', payment_status: 'paid', amount_total: 10000, metadata: { kind: 'job_payment', job_id: 'test-job' } } } }
    mocks.constructEvent.mockImplementation(() => event)
    mocks.createClient.mockReturnValue({ from: (table: string) => {
      let isUpdate = false
      const query: any = {
        select: () => query, eq: () => query, or: () => query,
        update: (values: any) => { isUpdate = true; updates.push({table, values}); return query },
        insert: () => query,
        single: async () => ({ data: table === 'sms_templates' ? {body:'Payment received. Track: {tracking_link}'} : job, error:null }),
        maybeSingle: async () => ({data:table === 'payments' ? {id:'test-payment',status:'paid',kind:event.data.object.metadata.kind,job_id:'test-job',amount_pence:paidAmount} : null}),
        then: (resolve: any) => Promise.resolve({ data: table === 'payments' ? isUpdate ? redelivery ? [] : [{id:'test-payment',kind:event.data.object.metadata.kind,job_id:'test-job',amount_pence:paidAmount}] : [{amount_pence:paidAmount,kind:event.data.object.metadata.kind}] : null, error:table === 'jobs' && isUpdate ? updateError : null }).then(resolve),
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
  it('marks a cash deposit plus online balance fully paid', async () => {
    job.deposit_received = true
    job.deposit_amount = 20
    paidAmount = 8000
    await send()
    expect(updates.find(update => update.table === 'jobs').values.payment_received).toBe(true)
  })
  it('reconciles a paid redelivery after an earlier job update failed', async () => {
    updateError = {message:'Test write failed'}
    expect((await send()).status).toBe(500)
    redelivery = true
    updateError = null
    expect((await send()).status).toBe(200)
    expect(updates.filter(update => update.table === 'jobs').at(-1).values.payment_received).toBe(true)
  })
  it('fills the tracking URL in a deposit receipt', async () => {
    mocks.smsEnabled.mockReturnValue(true)
    event.data.object.metadata.kind = 'job_deposit'
    paidAmount = 2000
    await send()
    expect(mocks.sendSms.mock.calls[0][1]).toContain('https://nfdr.uk/t/short123')
    expect(mocks.sendSms.mock.calls[0][1]).not.toContain('{tracking_link}')
  })
})
