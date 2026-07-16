import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate webhook secret (add to .env)
    const webhookSecret = request.headers.get('x-webhook-secret')
    if (webhookSecret !== process.env.AI_RESPONDER_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const {
      quote_request_id,
      customer_name,
      customer_phone,
      customer_email,
      device_type,
      device_make,
      device_model,
      issue,
      description,
      quoted_price,
      status,
      source_page,
      conversation_id,
      created_at, // Original creation date from AI Responder
    } = body

    // Validate required fields
    if (!quote_request_id || !customer_name || !customer_phone || !device_make || !device_model || !issue) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Upsert quote (insert or update if exists)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .upsert({
        quote_request_id,
        customer_name,
        customer_phone,
        customer_email: customer_email || null,
        device_type: device_type || null,
        device_make,
        device_model,
        issue,
        description: description || null,
        quoted_price: quoted_price || null,
        status: status || 'pending',
        source_page: source_page || null,
        conversation_id: conversation_id || null,
        original_created_at: created_at || new Date().toISOString(), // Original creation date from AI Responder
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'quote_request_id',
      })
      .select()
      .single()

    if (quoteError) {
      console.error('Failed to sync quote:', quoteError)
      return NextResponse.json(
        { error: 'Failed to sync quote', details: quoteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      quote_id: quote.id,
      message: 'Quote synced successfully',
    })

  } catch (error) {
    console.error('Quote sync error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
