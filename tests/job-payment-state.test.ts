import { describe, expect, it } from 'vitest'
import { jobPaymentState } from '@/lib/job-payment-state'
import { partsPaymentMessage } from '@/lib/parts-payment-message'
const job = { price_total:100, deposit_amount:20, deposit_required:true, status:'AWAITING_DEPOSIT' }
describe('repair payment calculations and status messages', () => {
  it('offers £20 deposit or £100 full payment before payment', () => {
    expect(jobPaymentState(job, [])).toMatchObject({depositDue:2000,balance:10000,paid:0,canPay:true})
  })
  it('deducts an in-shop deposit from the online balance', () => {
    expect(jobPaymentState({...job,deposit_received:true}, [])).toMatchObject({depositDue:0,balance:8000,paid:2000})
  })
  it('does not count the online deposit twice', () => {
    expect(jobPaymentState({...job,deposit_received:true}, [{kind:'job_deposit',amount_pence:2000}])).toMatchObject({depositDue:0,balance:8000,paid:2000})
  })
  it('recognises a paid deposit while flags are still being updated', () => {
    expect(jobPaymentState(job, [{kind:'job_deposit',amount_pence:2000}])).toMatchObject({depositDue:0,balance:8000})
  })
  it('settles an in-shop deposit plus an online balance', () => {
    expect(jobPaymentState({...job,deposit_received:true}, [{kind:'job_payment',amount_pence:8000}])).toMatchObject({fullyPaid:true,balance:0,paid:10000})
  })
  it('recognises full payment before flags update', () => {
    expect(jobPaymentState(job, [{kind:'job_payment',amount_pence:10000}])).toMatchObject({depositDue:0,fullyPaid:true,balance:0})
  })
  it('caps the deposit at the remaining total', () => {
    expect(jobPaymentState({...job,price_total:15}, [])).toMatchObject({depositDue:1500,balance:1500})
  })
  it('does not invent a cash deposit after an online deposit capped at the total', () => {
    expect(jobPaymentState({...job,price_total:15,deposit_received:true}, [{kind:'job_deposit',amount_pence:1500}])).toMatchObject({paid:1500,balance:0})
  })
  it.each([null,0,-1,NaN])('blocks payment for an unconfirmed or invalid price %s', price_total => {
    expect(jobPaymentState({...job,price_total}, [])).toMatchObject({canPay:false,fullyPaid:false,depositDue:0})
  })
  it('blocks payment for cancelled repairs', () => {
    expect(jobPaymentState({...job,status:'CANCELLED'}, [])).toMatchObject({canPay:false,depositDue:0})
  })
  it('links unpaid status replies to the repair website with both choices', () => {
    const text = partsPaymentMessage({tracking_token:'long-token',short_token:'short123'})
    expect(text).toContain('/pay/?t=short123')
    expect(text).toContain('Klarna')
    expect(text).not.toContain('sumup')
  })
  it.each([{deposit_received:true},{payment_received:true}])('does not ask paid customers to pay again', flags => {
    const text = partsPaymentMessage({...flags,tracking_token:'test-token'})
    expect(text).toContain('payment has been received')
    expect(text).not.toContain('/pay/')
    expect(text).not.toContain('already ordered')
  })
})
