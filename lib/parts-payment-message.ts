import { repairPaymentLink } from './utils'

export function partsPaymentMessage(job: {
  tracking_token?: string | null; short_token?: string | null
  deposit_amount?: number | null; deposit_received?: boolean; payment_received?: boolean
}) {
  if (job.deposit_received || job.payment_received) {
    return "Your payment has been received. We're arranging your parts order and will text you when the parts arrive."
  }
  const amount = Number(job.deposit_amount ?? 20).toFixed(2)
  const link = job.tracking_token || job.short_token
    ? `\n${repairPaymentLink({ tracking_token: job.tracking_token || job.short_token!, short_token: job.short_token })}`
    : ''
  return `We need to order your parts. Pay a £${amount} deposit (deducted from your total), or pay in full by card or Klarna where eligible. Choose on our website:${link}`
}
