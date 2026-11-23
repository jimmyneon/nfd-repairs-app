/** Shared invoice model. All money is stored as integer pence. */
export type InvoiceItem = {
  description: string
  quantity: number
  unit_pence: number
}
export type InvoiceBankAccount = {
  bank_name: string
  account_name: string
  sort_code: string
  account_number: string
}
export const EMPTY_INVOICE_BANK: InvoiceBankAccount = {
  bank_name: '',
  account_name: '',
  sort_code: '',
  account_number: '',
}
export type BillingSettings = {
  business_name: string
  legal_name: string
  address: string
  email: string
  website: string
  bank_name: string
  account_name: string
  sort_code: string
  account_number: string
  payment_instructions: string
  footer: string
}
export type InvoicePayload = {
  customer_name: string
  customer_email: string
  customer_address: string
  title: string
  reference: string
  issue_date: string
  due_date: string
  items: InvoiceItem[]
  notes: string
  payment_method: 'bank_transfer' | 'in_shop'
  payment_instructions: string
  bank_account?: InvoiceBankAccount
  seller?: BillingSettings
  period_start?: string
  period_end?: string
}
export type Invoice = {
  id: string
  number: string | null
  status: 'draft' | 'issued' | 'void'
  payload: InvoicePayload
  job_id: string | null
  series_id: string | null
  occurrence_date: string | null
  public_token?: string
  paid_pence: number
  sent_at: string | null
  email_error: string | null
  created_at: string
}
export type InvoiceSeries = {
  id: string
  name: string
  template: InvoicePayload
  next_date: string
  anchor_day: number
  ends_on: string | null
  active: boolean
  auto_email: boolean
  created_at: string
}
export const DEFAULT_BILLING: BillingSettings = {
  business_name: 'New Forest Device Repairs',
  legal_name: 'John Hopwood trading as New Forest Device Repairs',
  address: '5A New Street\nLymington\nHampshire\nSO41 9BH',
  email: 'nfdrepairs@gmail.com',
  website: 'https://nfdr.uk',
  bank_name: '',
  account_name: '',
  sort_code: '',
  account_number: '',
  payment_instructions: '',
  footer: 'Thank you for your business.',
}
export const COMPLETED_INVOICE_STATUSES = [
  'READY_TO_COLLECT',
  'IN_STORAGE',
  'COLLECTED',
  'COMPLETED',
]
export const money = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    pence / 100,
  )
export const todayUK = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export const invoiceTotal = (p: InvoicePayload) =>
  p.items.reduce((sum, i) => sum + Math.round(i.quantity * i.unit_pence), 0)
export function validDate(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(v)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v
  )
}
export function validateInvoice(value: any): InvoicePayload {
  if (!value || typeof value !== 'object')
    throw Error('Invoice details are required.')
  const text = (k: string, max: number, required = false) => {
    if (
      typeof value[k] !== 'string' ||
      value[k].length > max ||
      (required && !value[k].trim())
    )
      throw Error(`Check ${k.replace(/_/g, ' ')}.`)
    return value[k].trim()
  }
  const customer_email = text('customer_email', 254)
  if (
    customer_email &&
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(customer_email)
  )
    throw Error('Enter a valid email address.')
  if (
    !validDate(value.issue_date) ||
    !validDate(value.due_date) ||
    value.due_date < value.issue_date
  )
    throw Error('Check the invoice and due dates.')
  if (!['bank_transfer', 'in_shop'].includes(value.payment_method))
    throw Error('Choose a payment method.')
  if (
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 100
  )
    throw Error('Add between 1 and 100 invoice lines.')
  const items = value.items.map((i: any) => {
    if (
      typeof i?.description !== 'string' ||
      !i.description.trim() ||
      i.description.length > 3000 ||
      !Number.isFinite(i.quantity) ||
      i.quantity <= 0 ||
      i.quantity > 10000 ||
      Math.abs(Math.round(i.quantity * 1000) - i.quantity * 1000) > 0.000001 ||
      !Number.isSafeInteger(i.unit_pence) ||
      i.unit_pence < 0 ||
      i.unit_pence > 100000000
    )
      throw Error('Check each item, quantity and price.')
    return {
      description: i.description.trim(),
      quantity: i.quantity,
      unit_pence: i.unit_pence,
    }
  })
  const p: InvoicePayload = {
    customer_name: text('customer_name', 300, true),
    customer_email,
    customer_address: text('customer_address', 1500),
    title: text('title', 200, true),
    reference: text('reference', 200),
    issue_date: value.issue_date,
    due_date: value.due_date,
    items,
    notes: text('notes', 6000),
    payment_method: value.payment_method,
    payment_instructions: text('payment_instructions', 3000),
  }
  if (value.bank_account !== undefined)
    p.bank_account = validateInvoiceBank(value.bank_account)
  if (invoiceTotal(p) > 100000000) throw Error('Invoice total is too large.')
  return p
}
export function validateBilling(value: any): BillingSettings {
  const out = { ...DEFAULT_BILLING }
  for (const k of Object.keys(out) as (keyof BillingSettings)[]) {
    if (typeof value?.[k] !== 'string' || value[k].length > 3000)
      throw Error(`Check ${k.replace(/_/g, ' ')}.`)
    out[k] = value[k].trim()
  }
  if (!out.business_name || !out.legal_name || !out.address || !out.email)
    throw Error('Business name, legal name, address and email are required.')
  if (!/^https:\/\/[^\s<>"']+$/.test(out.website))
    throw Error('Website must start with https://.')
  if (out.sort_code && !/^\d{2}-?\d{2}-?\d{2}$/.test(out.sort_code))
    throw Error('Sort code must contain six digits.')
  if (out.account_number && !/^\d{8}$/.test(out.account_number))
    throw Error('Account number must contain eight digits.')
  return out
}
export function validateInvoiceBank(value: unknown): InvoiceBankAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Check the invoice bank details.')
  const out = { ...EMPTY_INVOICE_BANK }
  for (const key of Object.keys(out) as (keyof InvoiceBankAccount)[]) {
    const v = (value as Record<string, unknown>)[key]
    if (typeof v !== 'string' || v.length > 200)
      throw Error('Check the invoice bank details.')
    out[key] = v.trim()
  }
  if (out.sort_code && !/^\d{2}-?\d{2}-?\d{2}$/.test(out.sort_code))
    throw Error('Sort code must contain six digits.')
  if (out.account_number && !/^\d{8}$/.test(out.account_number))
    throw Error('Account number must contain eight digits.')
  return out
}
export function bankReady(s: InvoiceBankAccount) {
  return !!(
    s.account_name &&
    /^\d{2}-?\d{2}-?\d{2}$/.test(s.sort_code) &&
    /^\d{8}$/.test(s.account_number)
  )
}
export function paymentText(p: InvoicePayload, number = 'your invoice number') {
  const s = p.seller || DEFAULT_BILLING
  const account = p.bank_account ?? s
  if (p.payment_method === 'bank_transfer')
    return [
      'Please pay by bank transfer or standing order.',
      account.bank_name,
      `Account name: ${account.account_name}`,
      `Sort code: ${account.sort_code}`,
      `Account number: ${account.account_number}`,
      `Payment reference: ${p.reference || number}`,
      p.payment_instructions || s.payment_instructions,
    ]
      .filter(Boolean)
      .join('\n')
  return (
    p.payment_instructions ||
    'Please pay in the shop. If you have already paid, thank you.'
  )
}
export function emptyInvoice(): InvoicePayload {
  return {
    customer_name: '',
    customer_email: '',
    customer_address: '',
    title: 'Invoice',
    reference: '',
    issue_date: todayUK(),
    due_date: todayUK(),
    items: [{ description: '', quantity: 1, unit_pence: 0 }],
    notes: '',
    payment_method: 'in_shop',
    payment_instructions: '',
  }
}
