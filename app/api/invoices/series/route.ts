import { NextRequest, NextResponse } from 'next/server'
import {
  billingSettings,
  invoiceHeaders,
  invoiceStaff,
} from '@/lib/invoice-service'
import { bankReady, validDate, validateInvoice } from '@/lib/invoices'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const a = await invoiceStaff(request)
    if (a.response) return a.response
    const { data, error } = await a
      .db!.from('billing_series')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ series: data }, { headers: invoiceHeaders })
  } catch {
    return NextResponse.json(
      { error: 'Recurring invoices unavailable.' },
      { status: 503, headers: invoiceHeaders },
    )
  }
}
export async function POST(request: NextRequest) {
  try {
    const a = await invoiceStaff(request)
    if (a.response) return a.response
    const b = await request.json(),
      template = validateInvoice(b.template)
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 300)
      throw Error('Name this recurring invoice.')
    if (
      !validDate(b.next_date) ||
      (b.ends_on &&
        (!validDate(b.ends_on) ||
          (b.active === true && b.ends_on < b.next_date)))
    )
      throw Error('Check the schedule dates.')
    const anchor = Number(b.anchor_day)
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31)
      throw Error('Choose a billing day between 1 and 31.')
    const active = b.active === true,
      auto_email = b.auto_email === true
    if (active && auto_email && !template.customer_email)
      throw Error('An email address is required for automatic delivery.')
    if (
      active &&
      template.payment_method === 'bank_transfer' &&
      !bankReady(template.bank_account ?? (await billingSettings(a.db!)))
    )
      throw Error(
        'Add complete bank details to this schedule or Invoice settings before activating.',
      )
    const value = {
      name: b.name.trim(),
      template,
      next_date: b.next_date,
      anchor_day: anchor,
      ends_on: b.ends_on || null,
      active,
      auto_email,
    }
    const q = b.id
      ? a.db!.from('billing_series').update(value).eq('id', b.id)
      : a.db!.from('billing_series').insert(value)
    const { data, error } = await q.select('id').single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { headers: invoiceHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400, headers: invoiceHeaders },
    )
  }
}
