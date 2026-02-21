import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_token', request.url))
  }

  const { data: magicLink, error: linkError } = await supabase
    .from('magic_links')
    .select('*')
    .eq('token', token)
    .single()

  if (linkError || !magicLink) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_token', request.url))
  }

  if (magicLink.used) {
    return NextResponse.redirect(new URL('/auth/login?error=link_already_used', request.url))
  }

  if (new Date(magicLink.expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/auth/login?error=link_expired', request.url))
  }

  await supabase
    .from('magic_links')
    .update({ used: true })
    .eq('token', token)

  const response = NextResponse.redirect(new URL(`/repair/${magicLink.repair_id}`, request.url))
  
  response.cookies.set('repair_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })

  return response
}
