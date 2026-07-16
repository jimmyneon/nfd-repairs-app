import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
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
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Email required for web/home services, optional for repair_quote and business
    if (enquiry_type !== 'repair_quote' && !customer_email) {
      return NextResponse.json(
        { error: 'Missing required field: customer_email' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Phone required for repair_quote
    if (enquiry_type === 'repair_quote' && !customer_phone) {
      return NextResponse.json(
        { error: 'Missing required field: customer_phone' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (enquiry_type === 'web_services') {
      if (!project_type || !sector || !number_pages || !goals || !project_description) {
        return NextResponse.json(
          { error: 'Missing required web services fields' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
    } else if (enquiry_type === 'home_services') {
      if (!service_type || !address || !description) {
        return NextResponse.json(
          { error: 'Missing required home services fields' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
    }

    // Insert enquiry into database
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .insert({
        enquiry_type,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
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
        quoted_price: quoted_price || null,
        quote_type: quote_type || null,
        issue_description: issue_description || null,
        terms_accepted: terms_accepted || false,
        proceed_with_repair: proceed_with_repair || false,
        marketing_consent: marketing_consent || false,
        quote_source: quote_source || null,
        additional_repairs: additional_repairs || null,
        part_option: part_option || null,
        display_price: display_price || null,
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
      return NextResponse.json(
        { error: 'Failed to create enquiry' },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create notification for staff
    await supabase.from('notifications').insert({
      type: 'NEW_ENQUIRY',
      title: enquiry_type === 'repair_quote'
        ? `New Repair Quote: ${device_make || ''} ${device_model || ''}`
        : `New ${enquiry_type === 'web_services' ? 'Web Services' : enquiry_type === 'business' ? 'Business' : 'Home Services'} Enquiry`,
      body: enquiry_type === 'repair_quote'
        ? `${customer_name} - ${repair_type || 'Repair'}${quoted_price ? ' - £' + quoted_price : ' - Personalized quote'}`
        : `${customer_name} - ${enquiry_type === 'web_services' ? project_type : enquiry_type === 'business' ? (body.help_type || 'Business') : service_type}`,
      is_read: false,
    } as any)

    // Note: Quote SMS/email is NOT sent here — it's only sent when the customer
    // explicitly clicks "Send Me This Quote" via the /api/enquiries/update endpoint
    // with action: 'send_quote'. This prevents double-sending.

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiry.enquiry_ref,
      message: 'Your enquiry has been submitted successfully. We will contact you within 24 hours.',
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error processing enquiry submission:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
