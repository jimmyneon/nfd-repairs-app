import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const DEFAULT_AI_DESK_URL = 'https://ai-desk-theta.vercel.app'

/**
 * Trigger an outbound AI call from Alex (AI Desk) for a personalised quote,
 * quote follow-up, diagnostic explanation, or collection chase.
 *
 * POST /api/ai-desk/outbound-call
 */
export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const baseUrl = (process.env.AI_DESK_URL || DEFAULT_AI_DESK_URL).replace(/\/+$/, '')
  const apiKey = process.env.AI_DESK_API_KEY || process.env.CRON_SECRET

  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI_DESK_API_KEY or CRON_SECRET is not configured' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(`${baseUrl}/api/outbound/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as any)?.error || `AI Desk outbound call failed (${res.status})` },
        { status: res.status }
      )
    }

    return NextResponse.json({ ok: true, ...data })
  } catch (e: any) {
    console.error('[ai-desk/outbound-call] failed:', e)
    return NextResponse.json(
      { error: e?.message || 'Could not reach AI Desk to start outbound call' },
      { status: 502 }
    )
  }
}
