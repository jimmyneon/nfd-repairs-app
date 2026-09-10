import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const MAX_DAYS_AHEAD = 180

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

function calculateReminderAt(plannedDate: string): string {
  // 09:00 UTC on the previous day = 09:00 GMT / 10:00 BST.
  // This deliberately stays inside the app's 08:00–20:00 UK SMS window year-round.
  const d = new Date(`${plannedDate}T09:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * POST /api/enquiries/plan-later
 *
 * Converts an existing repair-quote enquiry into a non-binding planned visit.
 * Payment is deliberately separate: a planned visit costs £0. If a special-order
 * part is needed, the normal job deposit workflow can request a deposit later.
 *
 * Body: {
 *   enquiry_ref: string,
 *   planned_visit_date: YYYY-MM-DD,
 *   reminder_requested?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'enquiries_plan_later', 10)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers }
      )
    }

    const body = await request.json()
    const enquiryRef = String(body?.enquiry_ref || '').trim()
    const plannedDate = body?.planned_visit_date
    const reminderRequested = body?.reminder_requested === true

    if (!enquiryRef || !isIsoDate(plannedDate)) {
      return NextResponse.json(
        { error: 'enquiry_ref and a valid planned_visit_date are required' },
        { status: 400, headers }
      )
    }

    const today = new Date()
    const candidate = dateOnlyUtc(plannedDate)
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 12))
    const maxDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + MAX_DAYS_AHEAD, 12))

    if (Number.isNaN(candidate.getTime()) || candidate < tomorrow || candidate > maxDate) {
      return NextResponse.json(
        { error: `Please choose a date between tomorrow and ${MAX_DAYS_AHEAD} days from now.` },
        { status: 400, headers }
      )
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, enquiry_type, status, converted_to_job')
      .eq('enquiry_ref', enquiryRef)
      .single()

    if (enquiryError || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404, headers })
    }

    if (enquiry.enquiry_type !== 'repair_quote') {
      return NextResponse.json({ error: 'This action is only available for repair quotes.' }, { status: 400, headers })
    }

    if (enquiry.converted_to_job) {
      return NextResponse.json(
        { error: 'This enquiry has already been converted to a repair job.' },
        { status: 409, headers }
      )
    }

    const reminderAt = reminderRequested ? calculateReminderAt(plannedDate) : null
    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        commitment_type: 'planned_visit',
        planned_visit_date: plannedDate,
        payday_date: plannedDate, // temporary compatibility with the existing admin UI
        reminder_requested: reminderRequested,
        reminder_at: reminderAt,
        reminder_sent_at: null,
        reminder_cancelled_at: null,
        reminder_count: 0,
        proceed_with_repair: true,
        quote_source: 'planned_visit',
        status: 'approved',
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('[plan-later] Failed to update enquiry:', updateError)
      const migrationMissing = /column|schema cache|planned_visit|reminder_/i.test(updateError.message || '')
      return NextResponse.json(
        {
          error: migrationMissing
            ? 'Quote reminder database migration has not been applied yet.'
            : 'Failed to save repair plan.',
          migration_required: migrationMissing,
        },
        { status: migrationMissing ? 503 : 500, headers }
      )
    }

    try {
      await supabase.from('notifications').insert({
        type: 'QUOTE_ACTION',
        title: `Repair planned for ${plannedDate}`,
        body: `Customer selected a future visit date${reminderRequested ? ' and requested an automatic reminder' : ''}.`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[plan-later] Notification insert failed:', e)
    }

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiryRef,
      planned_visit_date: plannedDate,
      reminder_requested: reminderRequested,
      reminder_at: reminderAt,
    }, { headers })
  } catch (error) {
    console.error('[plan-later] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers })
  }
}
