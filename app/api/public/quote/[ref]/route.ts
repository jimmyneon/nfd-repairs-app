import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'
import {
  getAvailableAccessories,
  getAvailableAddOns,
  normalizePublicQuoteRef,
  type QuoteCatalogueRow,
} from '@/lib/public-quote-options'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function loadCatalogue(): Promise<QuoteCatalogueRow[]> {
  try {
    const response = await fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json', {
      next: { revalidate: 300 },
    })
    if (!response.ok) return []
    const payload = await response.json()
    return Array.isArray(payload?.quotes) ? payload.quotes : []
  } catch {
    return []
  }
}

function formatDate(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  })
}

function buildCustomerUpdate(job: any | null) {
  if (!job) {
    return {
      key: 'checking_parts',
      title: 'We’re checking the part',
      message: 'We’ve got your repair request and we’re checking stock and any parts needed now.',
      detail: 'We’ll message you before you make the trip if there is anything you need to know. You don’t need to do anything yet.',
    }
  }

  const expected = formatDate(job.parts_expected_at || job.parts_tracking_eta)
  const deposit = Number(job.deposit_amount || 20)

  switch (String(job.status || '')) {
    case 'AWAITING_DEVICE':
      return {
        key: 'parts_in_stock',
        title: 'Parts confirmed — ready to bring it in',
        message: 'We have the part in stock for your repair.',
        detail: 'Bring the device in during opening hours when convenient — no fixed appointment needed.',
      }
    case 'AWAITING_DEPOSIT':
      return {
        key: 'awaiting_deposit',
        title: 'We need to order the part',
        message: `The part needs ordering before we can start the repair.`,
        detail: `We’ve sent the £${deposit.toFixed(0)} deposit request. The deposit comes off the final repair price.`,
      }
    case 'PARTS_ORDERED':
      return {
        key: 'parts_ordered',
        title: 'Your part has been ordered',
        message: 'We’ll message you as soon as it arrives.',
        detail: expected ? `Expected availability: ${expected}.` : 'You don’t need to do anything while we wait for it.',
      }
    case 'PARTS_ARRIVED':
      return {
        key: 'parts_arrived',
        title: 'Your part has arrived',
        message: 'The part is here and your repair can move forward.',
        detail: job.device_in_shop ? 'Your device is already with us.' : 'Bring the device in during opening hours when convenient.',
      }
    case 'DROPPED_OFF':
    case 'RECEIVED':
      return {
        key: 'device_received',
        title: 'We have your device',
        message: 'Your device has been checked in with us.',
        detail: 'We’ll message you as the repair progresses.',
      }
    case 'DIAGNOSTIC':
      return {
        key: 'diagnostic',
        title: 'We’re checking your device',
        message: 'Your device is currently being assessed.',
        detail: 'We’ll contact you if we need approval or any more information.',
      }
    case 'AWAITING_CUSTOMER':
      return {
        key: 'awaiting_customer',
        title: 'We need your reply',
        message: 'There is an update on your repair that needs your response.',
        detail: 'Please reply to the latest message from us so we can continue.',
      }
    case 'IN_REPAIR':
      return {
        key: 'in_repair',
        title: 'Repair in progress',
        message: 'Your repair is currently being worked on.',
        detail: 'We’ll message you when it is ready.',
      }
    case 'DELAYED':
      return {
        key: 'delayed',
        title: 'There’s a delay',
        message: 'Your repair is taking longer than expected.',
        detail: 'We’ll keep you updated as soon as we have more information.',
      }
    case 'READY_TO_COLLECT':
      return {
        key: 'ready',
        title: 'Ready to collect',
        message: 'Your repair is complete and ready for collection.',
        detail: 'Please check our opening hours before travelling.',
      }
    case 'COLLECTED':
    case 'COMPLETED':
      return {
        key: 'complete',
        title: 'Repair complete',
        message: 'This repair has been completed.',
        detail: 'Thanks for using NFD Repairs.',
      }
    case 'CANCELLED':
      return {
        key: 'cancelled',
        title: 'Repair cancelled',
        message: 'This repair is no longer active.',
        detail: 'Contact us if you want to discuss starting it again.',
      }
    default:
      return {
        key: 'checking_parts',
        title: 'We’re checking the part',
        message: 'Your repair request is saved and we’re checking the next step.',
        detail: 'We’ll message you if there is anything you need to know before coming in.',
      }
  }
}

/**
 * GET /api/public/quote/[ref]?t=<quote_action_token>
 *
 * Public endpoint for customers to view their quote without signing in.
 *
 * SECURITY:
 *  - The `ref` (enquiry_ref or job id) is only an identifier, NOT the
 *    authorisation key. Authorisation requires the matching `t`
 *    (quote_action_token) for that exact enquiry/job, which is a long
 *    cryptographically-random value tied to the record with expiry/revocation.
 *  - Rows with a NULL quote_action_token are NOT publicly accessible. If a
 *    legacy link predates token issuance, staff must send a new secure link
 *    (which generates the token). There is no insecure fallback.
 *  - Returns ONLY customer-facing quote fields (no PII, no staff notes,
 *    no internal fields).
 */
export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  // Rate limit: quote view loads.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'quote:view', 20)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const supabase = getAdminClient()
    const ref = normalizePublicQuoteRef(params.ref)
    const token = new URL(request.url).searchParams.get('t')

    // Try enquiries table first (ref is enquiry_ref for quote approvals)
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('enquiry_ref,created_at,device_make,device_model,repair_type,device_category,quoted_price,quote_type,part_option,screen_option,display_price,warranty,estimated_time,additional_repairs,accessories,status,dropoff_preference,dropoff_date,converted_to_job,converted_job_id,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('enquiry_ref', ref)
      .maybeSingle()

    if (enquiry && !enquiryError) {
      // Authorise: a valid token is always required. NULL-token rows are
      // not publicly accessible — staff must send a new secure link.
      if (!enquiry.quote_action_token ||
          !isQuoteActionTokenValid(token, enquiry.quote_action_token_expires_at, enquiry.quote_action_token_revoked_at) ||
          token !== enquiry.quote_action_token) {
        return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403 })
      }

      let linkedJob: any = null
      if (enquiry.converted_to_job && enquiry.converted_job_id) {
        const { data } = await supabase
          .from('jobs')
          .select('id,status,quoted_price,price_total,requires_parts_order,parts_required,deposit_required,deposit_amount,deposit_received,parts_expected_at,parts_tracking_eta,parts_tracking_status,device_in_shop,additional_issues,status_changed_at,updated_at')
          .eq('id', enquiry.converted_job_id)
          .maybeSingle()
        linkedJob = data || null
      }

      const catalogue = await loadCatalogue()
      const availableAddOns = getAvailableAddOns(catalogue, {
        category: enquiry.device_category,
        brand: enquiry.device_make,
        model: enquiry.device_model,
        primaryRepair: enquiry.repair_type,
      }, enquiry.additional_repairs || [])
      const availableAccessories = getAvailableAccessories({
        category: enquiry.device_category,
        brand: enquiry.device_make,
        primaryRepair: enquiry.repair_type,
      })

      return NextResponse.json({
        job_ref: enquiry.enquiry_ref,
        device_make: enquiry.device_make,
        device_model: enquiry.device_model,
        issue: enquiry.repair_type,
        device_category: enquiry.device_category,
        quoted_price: enquiry.quoted_price,
        price_total: enquiry.quoted_price,
        quote_type: enquiry.quote_type,
        part_option: enquiry.part_option || enquiry.screen_option,
        display_price: enquiry.display_price,
        warranty: enquiry.warranty,
        estimated_time: enquiry.estimated_time,
        additional_repairs: enquiry.additional_repairs || [],
        accessories: enquiry.accessories || [],
        available_addons: availableAddOns,
        available_accessories: availableAccessories,
        customer_update: buildCustomerUpdate(linkedJob),
        linked_job_status: linkedJob?.status || null,
        price_total: linkedJob?.price_total ?? enquiry.quoted_price,
        dropoff_preference: enquiry.dropoff_preference || null,
        dropoff_date: enquiry.dropoff_date || null,
        created_at: enquiry.created_at,
        requires_parts_order: false,
        status: enquiry.status,
      })
    }

    // Fallback: try jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,job_ref,device_make,device_model,issue,device_type,quoted_price,price_total,requires_parts_order,additional_issues,status,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('id', ref)
      .maybeSingle()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Authorise: a valid token is always required. NULL-token rows are
    // not publicly accessible — staff must send a new secure link.
    if (!job.quote_action_token ||
        !isQuoteActionTokenValid(token, job.quote_action_token_expires_at, job.quote_action_token_revoked_at) ||
        token !== job.quote_action_token) {
      return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403 })
    }

    const catalogue = await loadCatalogue()
    const availableAddOns = getAvailableAddOns(catalogue, {
      category: job.device_type,
      brand: job.device_make,
      model: job.device_model,
      primaryRepair: job.issue,
    }, (job.additional_issues || []).filter((item: any) => item?.option_type !== 'accessory'))
    const availableAccessories = getAvailableAccessories({
      category: job.device_type,
      brand: job.device_make,
      primaryRepair: job.issue,
    })

    // Return only customer-facing fields from the job
    return NextResponse.json({
      job_ref: job.job_ref,
      device_make: job.device_make,
      device_model: job.device_model,
      issue: job.issue,
      device_category: job.device_type,
      quoted_price: job.quoted_price,
      price_total: job.price_total,
      quote_type: null,
      part_option: null,
      display_price: null,
      warranty: null,
      estimated_time: null,
      additional_repairs: (job.additional_issues || []).filter((item: any) => item?.option_type !== 'accessory'),
      accessories: (job.additional_issues || [])
        .filter((item: any) => item?.option_type === 'accessory')
        .map((item: any) => ({ name: item.display_name || item.repair, price: Number(item.price || 0) })),
      available_addons: availableAddOns,
      available_accessories: availableAccessories,
      customer_update: buildCustomerUpdate(job),
      linked_job_status: job.status,
      requires_parts_order: job.requires_parts_order,
      status: job.status,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
