import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock environment variables
beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret-12345'
  process.env.STAFF_EMAILS = 'staff@example.com,admin@example.com'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.NEXT_PUBLIC_APP_URL = 'https://nfd-repairs-app.vercel.app'
})

describe('requireCronSecret', () => {
  it('should reject requests without authorization header', async () => {
    const { requireCronSecret } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/cron', {
      method: 'POST',
    })
    const response = requireCronSecret(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(401)
  })

  it('should reject requests with wrong secret', async () => {
    const { requireCronSecret } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/cron', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const response = requireCronSecret(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(401)
  })

  it('should accept requests with correct CRON_SECRET', async () => {
    const { requireCronSecret } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/cron', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret-12345' },
    })
    const response = requireCronSecret(request)
    expect(response).toBeNull()
  })
})

describe('getAllowedOrigin', () => {
  it('should return the request origin if it is in the allowed list', async () => {
    const { getAllowedOrigin } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://nfd-repairs-app.vercel.app' },
    })
    const origin = getAllowedOrigin(request)
    expect(origin).toBe('https://nfd-repairs-app.vercel.app')
  })

  it('should return the default origin if request origin is not allowed', async () => {
    const { getAllowedOrigin } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://evil-site.com' },
    })
    const origin = getAllowedOrigin(request)
    expect(origin).not.toBe('https://evil-site.com')
  })

  it('should return a valid origin if no origin header is present', async () => {
    const { getAllowedOrigin } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/test')
    const origin = getAllowedOrigin(request)
    expect(origin).toMatch(/^https:\/\//)
  })
})

describe('corsHeaders', () => {
  it('should include Vary: Origin header', async () => {
    const { corsHeaders } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/test', {
      headers: { origin: 'https://nfd-repairs-app.vercel.app' },
    })
    const headers = corsHeaders(request)
    expect(headers['Vary']).toBe('Origin')
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*')
  })

  it('should not return wildcard CORS origin', async () => {
    const { corsHeaders } = await import('@/lib/api-auth')
    const request = new NextRequest('http://localhost/api/test')
    const headers = corsHeaders(request)
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*')
  })
})
