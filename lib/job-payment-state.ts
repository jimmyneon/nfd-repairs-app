type PaymentJob = {
  status?: string; price_total?: number | null; deposit_amount?: number | null
  deposit_required?: boolean; deposit_received?: boolean; payment_received?: boolean
}
type PaidRow = { amount_pence: number; kind?: string }

/** Legacy staff-recorded deposits have no payments row. Credit them once. */
export function jobPaymentState(job: PaymentJob, rows: PaidRow[]) {
  const total = Math.round(Number(job.price_total || 0) * 100)
  const knownPrice = Number.isFinite(total) && total > 0
  const onlinePaid = rows.reduce((sum, row) => sum + Number(row.amount_pence || 0), 0)
  const onlineDeposits = rows.filter(row => row.kind === 'job_deposit' || row.kind === 'enquiry_deposit')
    .reduce((sum, row) => sum + Number(row.amount_pence || 0), 0)
  const deposit = Math.round(Number(job.deposit_amount ?? 20) * 100)
  const manualDeposit = job.deposit_received && !job.payment_received && onlineDeposits === 0
    ? Math.max(deposit, 0) : 0
  const paid = onlinePaid + manualDeposit
  const balance = knownPrice ? job.payment_received ? 0 : Math.max(total - paid, 0) : 0
  const canPay = knownPrice && job.status !== 'CANCELLED'
  const depositDue = canPay && job.deposit_required && !job.deposit_received && !job.payment_received
    ? Math.min(balance, Math.max(deposit - paid, 0)) : 0
  return { total, paid, balance, depositDue, canPay, fullyPaid: knownPrice && balance === 0 }
}
