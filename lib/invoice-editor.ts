import {
  InvoicePayload,
  InvoiceItem,
  Invoice,
  InvoiceSeries,
  validateInvoice,
  validDate,
} from './invoices'
export type InvoiceDraft = Omit<InvoicePayload, 'items'> & {
  items: { description: string; quantity: string; unit_price: string }[]
}
export type ScheduleDraft = {
  id?: string
  name: string
  next_date: string
  anchor_day: number
  ends_on: string
  active: boolean
  auto_email: boolean
}
export function invoiceToDraft(p: InvoicePayload): InvoiceDraft {
  return {
    ...p,
    bank_account: p.bank_account ? { ...p.bank_account } : undefined,
    items: p.items.map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unit_price: (i.unit_pence / 100).toFixed(2),
    })),
  }
}
export function poundsToPence(value: string): number {
  const v = value.trim().replace(/[£,\s]/g, '')
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(v))
    throw Error('Enter a price in pounds, with up to two decimal places.')
  const amount = Math.round(Number(v) * 100)
  if (!Number.isSafeInteger(amount) || amount > 100000000)
    throw Error('Enter a smaller price.')
  return amount
}
export function draftToInvoice(f: InvoiceDraft): InvoicePayload {
  const items: InvoiceItem[] = f.items.map((i) => {
    if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(i.quantity.trim()))
      throw Error('Enter a quantity with up to three decimal places.')
    return {
      description: i.description,
      quantity: Number(i.quantity),
      unit_pence: poundsToPence(i.unit_price),
    }
  })
  return validateInvoice({ ...f, items })
}
/** Mirror the database's month-end clamp and final-period proration for preview. */
export function recurringPreview(
  p: InvoicePayload,
  s: Pick<ScheduleDraft, 'next_date' | 'anchor_day' | 'ends_on'>,
): InvoicePayload {
  if (
    !validDate(s.next_date) ||
    !Number.isInteger(s.anchor_day) ||
    s.anchor_day < 1 ||
    s.anchor_day > 31
  )
    throw Error('Choose a valid next invoice date.')
  const start = new Date(s.next_date + 'T12:00:00Z')
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0, 12),
  ).getUTCDate()
  const next = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      Math.min(s.anchor_day, lastDay),
      12,
    ),
  )
  const fullEnd = new Date(next.getTime() - 86400000)
  if (s.ends_on && (!validDate(s.ends_on) || s.ends_on < s.next_date))
    throw Error('The final service date is before the next invoice.')
  const end =
    s.ends_on && s.ends_on < fullEnd.toISOString().slice(0, 10)
      ? new Date(s.ends_on + 'T12:00:00Z')
      : fullEnd
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    periodDays = Math.round((next.getTime() - start.getTime()) / 86400000)
  const date = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  const period = `${date(start)} to ${date(end)}`
  return {
    ...p,
    issue_date: s.next_date,
    due_date: s.next_date,
    period_start: s.next_date,
    period_end: end.toISOString().slice(0, 10),
    items: p.items.map((i) => ({
      ...i,
      description: i.description.replaceAll('{period}', period),
      unit_pence:
        days < periodDays
          ? Math.round((i.unit_pence * days) / periodDays)
          : i.unit_pence,
    })),
  }
}
export type InvoiceTransport = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<any>
export async function invoiceApi(
  path: string,
  body?: unknown,
  method = 'POST',
) {
  let r: Response
  try {
    r = await fetch(
      '/api/invoices' + path,
      body !== undefined
        ? {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
          }
        : { cache: 'no-store' },
    )
  } catch {
    throw Error(
      'Could not connect. Your changes are still here — please try saving again.',
    )
  }
  if (r.ok && r.headers.get('Content-Type')?.includes('application/pdf'))
    return { blob: await r.blob() }
  let data: any
  try {
    data = await r.json()
  } catch {
    throw Error(
      'The server did not respond correctly. Your changes are still here — please try again.',
    )
  }
  if (!r.ok)
    throw Error(
      r.status === 401
        ? 'Your session has expired. Sign in again to continue.'
        : data.error || 'Please try again.',
    )
  return data
}
export type InvoiceInitialData = {
  invoices: Invoice[]
  series: InvoiceSeries[]
  settings: import('./invoices').BillingSettings
}
