import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createSign } from 'crypto'

export const dynamic = 'force-dynamic'

interface ServiceAccount {
  project_id: string
  private_key: string
  client_email: string
}

function loadServiceAccount(): ServiceAccount {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json'
  return JSON.parse(readFileSync(path, 'utf-8'))
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token
  }

  const sa = loadServiceAccount()
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signInput = `${encodedHeader}.${encodedPayload}`

  const signer = createSign('RSA-SHA256')
  signer.update(signInput)
  const signature = signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')

  const jwt = `${signInput}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get OAuth2 token: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: now * 1000 + data.expires_in * 1000,
  }

  return cachedToken.token
}

/**
 * API endpoint to send FCM push notification via NF Hub
 * POST /api/notify/send
 *
 * Body: { title, body, category?, deep_link?, priority?, data? }
 */
export async function POST(request: NextRequest) {
  try {
    const { title, body, category, deep_link, priority, data } = await request.json()

    if (!title || !body) {
      return NextResponse.json(
        { error: 'title and body are required' },
        { status: 400 }
      )
    }

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

    // Get all registered device tokens for this app
    const { data: devices, error } = await supabase
      .from('nf_hub_devices')
      .select('device_token')
      .eq('app_id', 'nfd-repairs')

    if (error || !devices || devices.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No devices registered',
      })
    }

    const projectId = loadServiceAccount().project_id
    const accessToken = await getAccessToken()
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    const tokens = devices.map((d) => d.device_token)
    const results: boolean[] = []

    for (const token of tokens) {
      const message: any = {
        token,
        notification: { title, body },
        android: {
          priority: priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            priority: priority === 'high' ? 'max' : 'default',
          },
        },
        data: {
          app_id: 'nfd-repairs',
          category: category || '',
          deep_link: deep_link || '',
          priority: priority || 'normal',
          ...(data || {}),
        },
      }

      try {
        const response = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ message }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[NF Hub] FCM send failed for token ${token.slice(0, 12)}...:`, response.status, errorText)
          results.push(false)
        } else {
          results.push(true)
        }
      } catch (e) {
        console.error(`[NF Hub] Failed to send to token:`, e)
        results.push(false)
      }
    }

    const successCount = results.filter(Boolean).length
    console.log(`[NF Hub] Notification sent: ${successCount}/${results.length} devices reached`)

    return NextResponse.json({
      success: true,
      sent: successCount,
      total: tokens.length,
    })
  } catch (error) {
    console.error('Error in notify/send endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
