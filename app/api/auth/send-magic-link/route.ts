import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const { data: repairs, error: repairError } = await supabase
      .from('repairs')
      .select('id, customer_name, device_type, device_model')
      .eq('customer_email', email.toLowerCase())
      .order('created_at', { ascending: false })

    if (repairError) {
      console.error('Database error:', repairError)
      return NextResponse.json(
        { error: 'Failed to find repairs' },
        { status: 500 }
      )
    }

    if (!repairs || repairs.length === 0) {
      return NextResponse.json(
        { error: 'No repairs found for this email address' },
        { status: 404 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    const { error: linkError } = await supabase
      .from('magic_links')
      .insert({
        repair_id: repairs[0].id,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      } as any)
      .select()
      .single()

    if (linkError) {
      console.error('Failed to create magic link:', linkError)
      return NextResponse.json(
        { error: 'Failed to create access link' },
        { status: 500 }
      )
    }

    const magicLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/verify?token=${token}`

    console.log('Magic link generated:', magicLink)

    return NextResponse.json({
      success: true,
      message: 'Magic link sent successfully',
    })
  } catch (error) {
    console.error('Error in send-magic-link:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
