import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'

/**
 * POST /api/sms/pairing-code
 *
 * Generates a 6-digit pairing code for connecting an Android phone.
 * The code is shown on the settings page and entered in the Android app.
 *
 * This endpoint calls the relay's Supabase RPC (create_pairing_code)
 * with the repair app's API key. The relay returns a 6-digit code
 * that expires in 5 minutes.
 *
 * Auth: requires staff user session (only logged-in staff can pair phones).
 */
export async function POST(request: NextRequest) {
  // Only staff can generate pairing codes
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const relayUrl = process.env.RELAY_URL
  const relayAnonKey = process.env.RELAY_ANON_KEY
  const relayApiKey = process.env.RELAY_API_KEY

  if (!relayUrl || !relayAnonKey || !relayApiKey) {
    return NextResponse.json(
      { error: 'SMS relay not configured. Set RELAY_URL, RELAY_ANON_KEY, and RELAY_API_KEY.' },
      { status: 500 }
    )
  }

  try {
    const response = await fetchWithTimeout(
      `${relayUrl}/rest/v1/rpc/create_pairing_code`,
      {
        method: 'POST',
        headers: {
          'apikey': relayAnonKey,
          'Authorization': `Bearer ${relayAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: relayApiKey }),
      },
      10000
    )

    if (!response.ok) {
      const body = await response.text()
      console.error('[pairing-code] Relay error:', response.status, body)
      return NextResponse.json(
        { error: 'Could not generate pairing code' },
        { status: 500 }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      code: data.code,
      qr_string: data.qr_string,
      expires_in: data.expires_in,
    })
  } catch (err: any) {
    console.error('[pairing-code] Error:', err.message)
    return NextResponse.json(
      { error: 'Could not connect to relay' },
      { status: 500 }
    )
  }
}
