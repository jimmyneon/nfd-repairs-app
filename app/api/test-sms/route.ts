import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Simple test endpoint to manually trigger SMS send
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 TEST SMS ENDPOINT CALLED')
    
    // Use service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the most recent PENDING SMS
    const { data: pendingSms, error } = await supabase
      .from('sms_logs')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !pendingSms || pendingSms.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No pending SMS found',
        error: error?.message
      })
    }

    console.log('Found pending SMS:', pendingSms[0].id)

    // Trigger the SMS send endpoint
    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const response = await fetch(`${appUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await response.json()

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      result: result,
      smsLogId: pendingSms[0].id
    })
  } catch (error) {
    console.error('Test SMS error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
