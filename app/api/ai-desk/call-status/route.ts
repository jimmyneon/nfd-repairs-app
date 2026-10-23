import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const DEFAULT_AI_DESK_URL = 'https://ai-desk-theta.vercel.app'

/**
 * Poll the status of an outbound AI call so the UI can show
 * ringing → on the call → done / couldn't get through.
 *
 * GET /api/ai-desk/call-status?sid=CAxxxx
 */
export async function GET(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  const sid = request.nextUrl.searchParams.get('sid')
  if (!sid) {
    return NextResponse.json({ error: 'sid required' }, { status: 400 })
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
    const res = await fetch(
      `${baseUrl}/api/outbound/call-status?sid=${encodeURIComponent(sid)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as any)?.error || `Status check failed (${res.status})` },
        { status: res.status }
      )
    }
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[ai-desk/call-status] failed:', e)
    return NextResponse.json({ state: 'unknown' })
  }
}
