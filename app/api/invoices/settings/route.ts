import { NextRequest, NextResponse } from 'next/server'
import {
  billingSettings,
  invoiceHeaders,
  invoiceStaff,
} from '@/lib/invoice-service'
import { validateBilling } from '@/lib/invoices'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const a = await invoiceStaff(request)
    if (a.response) return a.response
    return NextResponse.json(
      { settings: await billingSettings(a.db!) },
      { headers: invoiceHeaders },
    )
  } catch {
    return NextResponse.json(
      { error: 'Invoice settings unavailable.' },
      { status: 503, headers: invoiceHeaders },
    )
  }
}
export async function POST(request: NextRequest) {
  try {
    const a = await invoiceStaff(request)
    if (a.response) return a.response
    const settings = validateBilling((await request.json()).settings)
    const { error } = await a
      .db!.from('billing_settings')
      .update({ data: settings, updated_at: new Date().toISOString() })
      .eq('id', true)
    if (error) throw error
    return NextResponse.json({ settings }, { headers: invoiceHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400, headers: invoiceHeaders },
    )
  }
}
