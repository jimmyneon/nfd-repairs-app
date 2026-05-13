import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
      // Common
      additional_info,
    } = body

    // Validate required fields based on enquiry type
    if (!enquiry_type || !customer_name || !customer_email) {
      return NextResponse.json(
        { error: 'Missing required fields: enquiry_type, customer_name, customer_email' },
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
        customer_email,
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
      title: `New ${enquiry_type === 'web_services' ? 'Web Services' : 'Home Services'} Enquiry`,
      body: `${customer_name} - ${enquiry_type === 'web_services' ? project_type : service_type}`,
      is_read: false,
    } as any)

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
