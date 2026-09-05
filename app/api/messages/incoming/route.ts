import { NextRequest } from 'next/server'
import { POST as handleSmsReply } from '../../sms/reply/route'

/**
 * Backwards-compatible MacroDroid endpoint.
 *
 * Existing phones post inbound SMS messages to /api/messages/incoming.
 * Keep that stable while the consolidated handler lives at /api/sms/reply.
 */
export async function POST(request: NextRequest) {
  return handleSmsReply(request)
}
