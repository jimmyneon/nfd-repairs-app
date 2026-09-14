import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (!stripeSecretKey) {
      console.error('[Remote Support] STRIPE_SECRET_KEY not set')
      return NextResponse.json(
        { error: 'Payment not configured' },
        { status: 503, headers: corsHeaders }
      )
    }

    const stripe = new Stripe(stripeSecretKey)
    const origin = request.headers.get('origin') || 'https://newforestdevicerepairs.co.uk'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'Remote Computer Support Session',
              description: 'Remote support session — flat rate. If we can\'t fix it remotely, the £60 becomes credit toward an in-shop repair.',
            },
            unit_amount: 6000, // £60.00 in pence
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/remote-support/booked/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/remote-support/`,
      metadata: {
        product: 'remote_support_session',
      },
    })

    return NextResponse.json({ url: session.url }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('[Remote Support] Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: corsHeaders }
    )
  }
}
