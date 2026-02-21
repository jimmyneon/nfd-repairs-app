import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { subscription, userId } = await request.json()

    if (!subscription || !userId) {
      return NextResponse.json(
        { error: 'Missing subscription or userId' },
        { status: 400 }
      )
    }

    // Use service role key for server-side database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('Failed to save subscription:', error)
      return NextResponse.json(
        { error: 'Failed to save subscription', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in subscribe endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
