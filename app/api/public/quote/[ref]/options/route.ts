import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'
import { normalizePublicQuoteRef } from '@/lib/public-quote-options'
import {
  mergeNamedItems,
  verifyRequestedAccessories,
  verifyRequestedAddOns,
  type QuoteCatalogueRow,
} from '@/lib/public-quote-options'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function loadCatalogue(): Promise<QuoteCatalogueRow[]> {
  const response = await fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json', {
    next: { revalidate: 300 },
  })
  if (!response.ok) throw new Error('Quote catalogue unavailable')
  const payload = await response.json()
  return Array.isArray(payload?.quotes) ? payload.quotes : []
}

function accessoryRepairKey(name: string): string {
  return 'accessory_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'quote:options', 20)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: CORS_HEADERS })
  }

  try {
    const supabase = createServiceClient()
    const ref = normalizePublicQuoteRef(params.ref)
    const token = new URL(request.url).searchParams.get('t')
    const body = await request.json().catch(() => ({}))
    const requestedRepairs = Array.isArray(body?.additional_repairs) ? body.additional_repairs : []
    const requestedAccessories = Array.isArray(body?.accessories) ? body.accessories : []
    const catalogue = requestedRepairs.length > 0 ? await loadCatalogue() : []

    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('enquiry_ref,device_category,device_make,device_model,repair_type,additional_repairs,accessories,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('enquiry_ref', ref)
      .maybeSingle()

    if (enquiry && !enquiryError) {
      if (!enquiry.quote_action_token ||
          !isQuoteActionTokenValid(token, enquiry.quote_action_token_expires_at, enquiry.quote_action_token_revoked_at) ||
          token !== enquiry.quote_action_token) {
        return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403, headers: CORS_HEADERS })
      }

      const verifiedRepairs = verifyRequestedAddOns(requestedRepairs, catalogue, {
        category: enquiry.device_category,
        brand: enquiry.device_make,
        model: enquiry.device_model,
        primaryRepair: enquiry.repair_type,
      })
      const verifiedAccessories = verifyRequestedAccessories(requestedAccessories, {
        category: enquiry.device_category,
        brand: enquiry.device_make,
        primaryRepair: enquiry.repair_type,
      })

      const mergedRepairs = mergeNamedItems(enquiry.additional_repairs, verifiedRepairs, 'repair')
      const mergedAccessories = mergeNamedItems(enquiry.accessories, verifiedAccessories, 'name')
      const changed =
        mergedRepairs.length !== (Array.isArray(enquiry.additional_repairs) ? enquiry.additional_repairs.length : 0) ||
        mergedAccessories.length !== (Array.isArray(enquiry.accessories) ? enquiry.accessories.length : 0)

      const { error: updateError } = await supabase
        .from('enquiries')
        .update({
          additional_repairs: mergedRepairs,
          accessories: mergedAccessories,
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', ref)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to save repair options' }, { status: 500, headers: CORS_HEADERS })
      }

      if (changed) {
        await supabase.from('notifications').insert({
          type: 'QUOTE_OPTIONS_UPDATED',
          title: 'Repair request updated',
          body: `${enquiry.enquiry_ref}: customer added options to ${enquiry.device_make || ''} ${enquiry.device_model || ''}`,
          is_read: false,
        })
      }

      return NextResponse.json({
        success: true,
        additional_repairs: mergedRepairs,
        accessories: mergedAccessories,
      }, { headers: CORS_HEADERS })
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,job_ref,device_type,device_make,device_model,issue,quoted_price,price_total,additional_issues,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('id', ref)
      .maybeSingle()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!job.quote_action_token ||
        !isQuoteActionTokenValid(token, job.quote_action_token_expires_at, job.quote_action_token_revoked_at) ||
        token !== job.quote_action_token) {
      return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403, headers: CORS_HEADERS })
    }

    const verifiedRepairs = verifyRequestedAddOns(requestedRepairs, catalogue, {
      category: job.device_type,
      brand: job.device_make,
      model: job.device_model,
      primaryRepair: job.issue,
    })
    const verifiedAccessories = verifyRequestedAccessories(requestedAccessories, {
      category: job.device_type,
      brand: job.device_make,
      primaryRepair: job.issue,
    })
    const accessoryIssues = verifiedAccessories.map(accessory => ({
      repair: accessoryRepairKey(accessory.name),
      display_name: accessory.name,
      price: accessory.price,
      option_type: 'accessory',
    }))
    const mergedIssues = mergeNamedItems(
      mergeNamedItems(job.additional_issues, verifiedRepairs, 'repair'),
      accessoryIssues,
      'repair'
    )
    const additionsTotal = mergedIssues.reduce((sum, item) => sum + Number(item?.price || 0), 0)
    const basePrice = Number(job.quoted_price || 0)

    const { error: jobUpdateError } = await supabase
      .from('jobs')
      .update({
        additional_issues: mergedIssues,
        price_total: basePrice + additionsTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    if (jobUpdateError) {
      return NextResponse.json({ error: 'Failed to save repair options' }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json({
      success: true,
      additional_repairs: mergedIssues,
      accessories: verifiedAccessories,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('[public quote options] error:', error)
    return NextResponse.json({ error: 'Failed to save repair options' }, { status: 500, headers: CORS_HEADERS })
  }
}
