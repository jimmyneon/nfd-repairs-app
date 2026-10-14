import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ client:vi.fn(), checkout:vi.fn(), open:vi.fn() }))
vi.mock('@/lib/resilience', () => ({createServiceClient:mocks.client}))
vi.mock('@/lib/api-auth', () => ({corsHeaders:() => ({})}))
vi.mock('@/lib/rate-limit', () => ({checkRateLimit:async () => ({allowed:true}),getClientIP:() => 'test'}))
vi.mock('@/lib/stripe', () => ({getStripe:() => ({})}))
vi.mock('@/lib/payments', () => ({createPaymentCheckout:mocks.checkout,findOpenPayment:mocks.open}))
import { GET } from '@/app/api/payments/due/route'
import { POST } from '@/app/api/payments/checkout/route'
describe('job payment endpoints', () => {
  let job:any
  let rows:any[]
  let historyError:any
  beforeEach(() => {
    vi.clearAllMocks()
    rows = []
    historyError = null
    job = {id:'test-job',job_ref:'TEST',status:'AWAITING_DEPOSIT',price_total:100,deposit_amount:20,deposit_required:true}
    mocks.checkout.mockResolvedValue({url:'https://checkout.stripe.com/test'})
    mocks.open.mockResolvedValue(null)
    mocks.client.mockReturnValue({from:(table:string) => {
      const query:any = {
        select:() => query, eq:() => query, or:() => query,
        single:async () => ({data:table === 'jobs' ? job : null,error:null}),
        maybeSingle:async () => ({data:null,error:historyError}),
        then:(resolve:any) => Promise.resolve({data:rows,error:null}).then(resolve),
      }
      return query
    }})
  })
  const pay = (kind:string) => POST(new NextRequest('https://example.test/api/payments/checkout', {method:'POST',body:JSON.stringify({kind,token:'test123',amount_pence:1})}))
  const due = () => GET(new NextRequest('https://example.test/api/payments/due?token=test123'))
  it('uses the server price for full payment', async () => {
    expect((await pay('job_payment')).status).toBe(200)
    expect(mocks.checkout.mock.calls[0][1].amountPence).toBe(10000)
  })
  it('charges only the £80 balance after an in-shop £20 deposit', async () => {
    job.deposit_received = true
    expect((await due()).status).toBe(200)
    expect(await (await due()).json()).toMatchObject({paid_pence:2000,balance_due_pence:8000,deposit_due_pence:0})
    await pay('job_payment')
    expect(mocks.checkout.mock.calls[0][1].amountPence).toBe(8000)
  })
  it('offers a £20 deposit before payment', async () => {
    await pay('job_deposit')
    expect(mocks.checkout.mock.calls[0][1].amountPence).toBe(2000)
  })
  it('does not charge a second deposit while flags lag behind the ledger', async () => {
    rows = [{kind:'job_deposit',amount_pence:2000}]
    expect((await pay('job_deposit')).status).toBe(409)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it.each([0,null])('blocks unknown price %s instead of calling it fully paid', async price_total => {
    job.price_total = price_total
    expect(await (await due()).json()).toMatchObject({can_pay:false,fully_paid:false})
    expect((await pay('job_payment')).status).toBe(409)
    expect((await pay('job_deposit')).status).toBe(409)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('blocks a cancelled repair', async () => {
    job.status = 'CANCELLED'
    expect((await pay('job_payment')).status).toBe(409)
    expect(await (await due()).json()).toMatchObject({can_pay:false})
  })
  it('fails closed when source payment history cannot be read', async () => {
    historyError = {message:'Test lookup failure'}
    expect((await due()).status).toBe(500)
    expect((await pay('job_payment')).status).toBe(500)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
})
