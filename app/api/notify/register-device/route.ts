import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * API endpoint for NF Hub device registration
 * POST /api/notify/register-device
 *
 * Body: { action: 'register' | 'unregister', device_token: string, app_id: string, platform: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { action, device_token, app_id, platform } = await request.json()

    if (!device_token || !app_id) {
      return NextResponse.json(
        { error: 'device_token and app_id are required' },
        { status: 400 }
      )
    }

    if (action === 'register') {
      const { error } = await supabase
        .from('nf_hub_devices')
        .upsert(
          {
            device_token,
            app_id,
            platform: platform || 'android',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_token' }
        )

      if (error) {
        console.error('Failed to register device:', error)
        return NextResponse.json(
          { error: 'Failed to register device', details: error.message },
          { status: 500 }
        )
      }

      console.log('[NF Hub] Device registered:', device_token.slice(0, 12) + '...')
      return NextResponse.json({ success: true })
    } else if (action === 'unregister') {
      const { error } = await supabase
        .from('nf_hub_devices')
        .delete()
        .eq('device_token', device_token)

      if (error) {
        console.error('Failed to unregister device:', error)
        return NextResponse.json(
          { error: 'Failed to unregister device' },
          { status: 500 }
        )
      }

      console.log('[NF Hub] Device unregistered:', device_token.slice(0, 12) + '...')
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error in register-device endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
