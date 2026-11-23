import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import {
  generateRecurring,
  invoiceHeaders,
  invoiceStaff,
} from '@/lib/invoice-service'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied
  try {
    return NextResponse.json(
      { results: await generateRecurring(createServiceClient()) },
      { headers: invoiceHeaders },
    )
  } catch {
    return NextResponse.json(
      { error: 'Recurring invoice run failed.' },
      { status: 500, headers: invoiceHeaders },
    )
  }
}
export async function POST(request: NextRequest) {
  const a = await invoiceStaff(request)
  if (a.response) return a.response
  try {
    return NextResponse.json(
      { results: await generateRecurring(a.db!) },
      { headers: invoiceHeaders },
    )
  } catch {
    return NextResponse.json(
      { error: 'Recurring invoice run failed.' },
      { status: 500, headers: invoiceHeaders },
    )
  }
}
