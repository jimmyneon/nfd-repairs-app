import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Proxy endpoint — forwards to central Notify API
 * POST /api/notify/send
 *
 * This is kept for backwards compatibility. New code should call
 * the central API directly: https://notify-api-liard.vercel.app/api/send
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const NOTIFY_API_URL = process.env.NOTIFY_API_URL || 'https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send'

    const response = await fetch(NOTIFY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, app_id: 'nfd-repairs' }),
    })

    const result = await response.json()
    return NextResponse.json(result, { status: response.status })
  } catch (error) {
    console.error('Error proxying to notify API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
