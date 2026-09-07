import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

// Server-side price verification: fetch catalogue and look up the real price by quote_key
async function verifyQuotePrice(quoteKey: string, clientPrice: number | null): Promise<{ verifiedPrice: number | null; displayPrice: string | null; partOption: string | null }> {
  try {
    const res = await fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json', {
      headers: { 'Cache-Control': 'no-store' },
    })
    if (!res.ok) return { verifiedPrice: null, displayPrice: null, partOption: null }
    const catalogue = await res.json()
    const match = (catalogue.quotes || []).find((q: any) => q.quoteKey === quoteKey)
    if (!match) return { verifiedPrice: null, displayPrice: null, partOption: null }
    return {
      verifiedPrice: match.customerPriceGbp ?? null,
      displayPrice: match.displayPrice ?? null,
      partOption: match.partOption ?? null,
    }
  } catch {
    return { verifiedPrice: null, displayPrice: null, partOption: null }
  }
}

// Input validation helpers
const MAX_NAME = 100
const MAX_EMAIL = 255
const MAX_PHONE = 30
const MAX_TEXT = 5000
const MAX_PRICE = 10000

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidUkPhone(phone: string): boolean {
  const c = phone.replace(/[\s\-()]/g, '')
  return /^(07|\+447)[0-9]{9}$/.test(c)
}

function clampLength(str: string, max: number): string {
  return String(str || '').substring(0, max)
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    const headers = corsHeaders(request)

    // Rate limit: 10 submissions per minute per IP
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'enquiries_submit', 10)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await request.json()
    
    const {
      enquiry_type,
      customer_name,
      customer_email,
      customer_phone,
      // Web Services fields
      project_type,
      sector,
      number_pages,
      goals,
      project_description,
      existing_website,
      existing_url,
      budget,
      timeline,
      // Home Services fields
      service_type,
      address,
      address_type,
      preferred_date,
      preferred_time,
      description,
      // Repair Quote fields
      device_category,
      device_make,
      device_model,
      repair_type,
      screen_option,
      quoted_price,
      quote_type,
      issue_description,
      terms_accepted,
      proceed_with_repair,
      marketing_consent,
      quote_source,
      additional_repairs,
      part_option,
      display_price,
      warranty,
      estimated_time,
      quote_key,
      // Common
      additional_info,
    } = body

    // Validate required fields based on enquiry type
    if (!enquiry_type || !customer_name) {
      return NextResponse.json(
        { error: 'Missing required fields: enquiry_type, customer_name' },
        { status: 400, headers }
      )
    }

    // Input validation — clamp lengths and validate formats
    const sanitizedName = clampLength(customer_name, MAX_NAME)
    const sanitizedEmail = customer_email ? clampLength(customer_email, MAX_EMAIL) : null
    const sanitizedPhone = customer_phone ? clampLength(customer_phone, MAX_PHONE) : null

    if (sanitizedEmail && !isValidEmail(sanitizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400, headers }
      )
    }

    if (enquiry_type === 'repair_quote' && sanitizedPhone && !isValidUkPhone(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid UK mobile number' },
        { status: 400, headers }
      )
    }

    // Clamp free-text fields
    if (issue_description) (body as any).issue_description = clampLength(issue_description, MAX_TEXT)
    if (additional_info) (body as any).additional_info = clampLength(additional_info, MAX_TEXT)
    if (project_description) (body as any).project_description = clampLength(project_description, MAX_TEXT)
    if (description) (body as any).description = clampLength(description, MAX_TEXT)
    if (quoted_price !== null && quoted_price !== undefined) {
      const p = Number(quoted_price)
      if (isNaN(p) || p < 0 || p > MAX_PRICE) {
        return NextResponse.json(
          { error: 'Invalid quoted price' },
          { status: 400, headers }
        )
      }
    }

    // Email required for web/home services, optional for repair_quote and business
    if (enquiry_type !== 'repair_quote' && !sanitizedEmail) {
      return NextResponse.json(
        { error: 'Missing required field: customer_email' },
        { status: 400, headers }
      )
    }

    // Phone required for repair_quote (unless email is provided — customer can choose email-only)
    if (enquiry_type === 'repair_quote' && !sanitizedPhone && !sanitizedEmail) {
      return NextResponse.json(
        { error: 'Missing required field: customer_phone or customer_email' },
        { status: 400, headers }
      )
    }

    if (enquiry_type === 'web_services') {
      if (!project_type || !sector || !number_pages || !goals || !project_description) {
        return NextResponse.json(
          { error: 'Missing required web services fields' },
          { status: 400, headers }
        )
      }
    } else if (enquiry_type === 'home_services') {
      if (!service_type || !address || !description) {
        return NextResponse.json(
          { error: 'Missing required home services fields' },
          { status: 400, headers }
        )
      }
    }

    // Server-side price verification for repair quotes
    // If a quote_key is provided, look up the real price from the catalogue
    // and override the client-sent price to prevent tampering
    let verifiedQuotedPrice = quoted_price
    let verifiedDisplayPrice = display_price
    let verifiedPartOption = part_option
    let priceTampered = false
    if (enquiry_type === 'repair_quote' && quote_key) {
      const verification = await verifyQuotePrice(quote_key, quoted_price)
      if (verification.verifiedPrice !== null) {
        if (quoted_price !== null && quoted_price !== verification.verifiedPrice) {
          console.warn(`[PRICE VERIFICATION] Tampered price detected for quote_key=${quote_key}: client sent ${quoted_price}, catalogue says ${verification.verifiedPrice}`)
          priceTampered = true
        }
        verifiedQuotedPrice = verification.verifiedPrice
        verifiedDisplayPrice = verification.displayPrice
        verifiedPartOption = verification.partOption
      }
    }

    // Insert enquiry into database
    let enquiryRef: string = ''
    try {
      const { data: enquiry, error: enquiryError } = await supabase
        .from('enquiries')
        .insert({
          enquiry_type,
          customer_name: sanitizedName,
          customer_email: sanitizedEmail || null,
          customer_phone: sanitizedPhone || null,
          // Web Services fields
          project_type: project_type || null,
          sector: sector || null,
          number_pages: number_pages || null,
          goals: goals || null,
          project_description: project_description || null,
          existing_website: existing_website || null,
          existing_url: existing_url || null,
          budget: budget || null,
          timeline: timeline || null,
          // Home Services fields
          service_type: service_type || null,
          address: address || null,
          address_type: address_type || null,
          preferred_date: preferred_date || null,
          preferred_time: preferred_time || null,
          description: description || null,
          // Repair Quote fields
          device_category: device_category || null,
          device_make: device_make || null,
          device_model: device_model || null,
          repair_type: repair_type || null,
          screen_option: screen_option || null,
          quoted_price: verifiedQuotedPrice || null,
          quote_type: quote_type || null,
          issue_description: issue_description || null,
          terms_accepted: terms_accepted || false,
          proceed_with_repair: proceed_with_repair || false,
          marketing_consent: marketing_consent || false,
          quote_source: quote_source || null,
          additional_repairs: additional_repairs || null,
          part_option: verifiedPartOption || null,
          display_price: verifiedDisplayPrice || null,
          warranty: warranty || null,
          estimated_time: estimated_time || null,
          quote_key: quote_key || null,
          // Common
          additional_info: additional_info || null,
          status: 'pending',
        })
        .select()
        .single() as any

      if (enquiryError) {
        console.error('Failed to create enquiry:', enquiryError)
        // Try again without the new columns that may not exist in DB yet
        const { data: enquiry2, error: enquiryError2 } = await supabase
          .from('enquiries')
          .insert({
            enquiry_type,
            customer_name,
            customer_email: customer_email || null,
            customer_phone: customer_phone || null,
            project_type: project_type || null,
            sector: sector || null,
            number_pages: number_pages || null,
            goals: goals || null,
            project_description: project_description || null,
            existing_website: existing_website || null,
            existing_url: existing_url || null,
            budget: budget || null,
            timeline: timeline || null,
            service_type: service_type || null,
            address: address || null,
            address_type: address_type || null,
            preferred_date: preferred_date || null,
            preferred_time: preferred_time || null,
            description: description || null,
            device_category: device_category || null,
            device_make: device_make || null,
            device_model: device_model || null,
            repair_type: repair_type || null,
            screen_option: screen_option || null,
            quoted_price: quoted_price || null,
            quote_type: quote_type || null,
            issue_description: issue_description || null,
            terms_accepted: terms_accepted || false,
            proceed_with_repair: proceed_with_repair || false,
            marketing_consent: marketing_consent || false,
            quote_source: quote_source || null,
            additional_info: additional_info || null,
            status: 'pending',
          })
          .select()
          .single() as any

        if (enquiryError2) {
          console.error('Fallback insert also failed:', enquiryError2)
          return NextResponse.json(
            { error: 'Failed to create enquiry' },
            { status: 500, headers }
          )
        }
        enquiryRef = enquiry2.enquiry_ref
      } else {
        enquiryRef = enquiry.enquiry_ref
      }
    } catch (insertErr: any) {
      console.error('Insert exception:', insertErr)
      return NextResponse.json(
        { error: 'Failed to create enquiry' },
        { status: 500, headers }
      )
    }

    // Create notification for staff
    const notifTitle = enquiry_type === 'repair_quote'
      ? `New Repair Quote: ${device_make || ''} ${device_model || ''}`
      : `New ${enquiry_type === 'web_services' ? 'Web Services' : enquiry_type === 'business' ? 'Business' : 'Home Services'} Enquiry`
    const notifBody = enquiry_type === 'repair_quote'
      ? `${customer_name} - ${repair_type || 'Repair'}${verifiedQuotedPrice ? ' - £' + verifiedQuotedPrice : ' - Personalized quote'}${priceTampered ? ' - ⚠️ PRICE TAMPERED' : ''}`
      : `${customer_name} - ${enquiry_type === 'web_services' ? project_type : enquiry_type === 'business' ? (body.help_type || 'Business') : service_type}`

    await supabase.from('notifications').insert({
      type: 'NEW_ENQUIRY',
      title: notifTitle,
      body: notifBody,
      is_read: false,
    } as any)

    // Note: MacroDroid webhook is NOT triggered here — only on quote approval.
    // Quote SMS/email is NOT sent here — it's only sent when the customer
    // explicitly clicks "Send Me This Quote" via the /api/enquiries/update endpoint
    // with action: 'send_quote'. This prevents double-sending.

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiryRef,
      message: 'Your enquiry has been submitted successfully. We will contact you within 24 hours.',
    }, {
      headers,
    })
  } catch (error) {
    console.error('Error processing enquiry submission:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    )
  }
}
