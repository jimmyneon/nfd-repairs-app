import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch for MacroDroid webhook tests
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('sendViaMacroDroid', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.MACRODROID_WEBHOOK_URL = 'https://macrodroid.example.com/webhook'
  })

  it('should send SMS via MacroDroid webhook with timeout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'OK',
      text: () => Promise.resolve('OK'),
    } as any)

    const { sendViaMacroDroid } = await import('@/lib/resilience')
    const result = await sendViaMacroDroid(
      'https://macrodroid.example.com/webhook',
      '07123456789',
      'Test message'
    )

    expect(result.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://macrodroid.example.com/webhook')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.phone).toBe('07123456789')
    expect(body.message).toBe('Test message')
  })

  it('should return ok=false when MacroDroid returns non-200', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      body: 'Error',
      text: () => Promise.resolve('Server error'),
    } as any)

    const { sendViaMacroDroid } = await import('@/lib/resilience')
    const result = await sendViaMacroDroid(
      'https://macrodroid.example.com/webhook',
      '07123456789',
      'Test message'
    )

    expect(result.ok).toBe(false)
  })

  it('should handle fetch timeout gracefully', async () => {
    mockFetch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 100)
    }))

    const { sendViaMacroDroid } = await import('@/lib/resilience')
    // sendViaMacroDroid catches errors and returns { ok: false }
    const result = await sendViaMacroDroid(
      'https://macrodroid.example.com/webhook',
      '07123456789',
      'Test'
    )
    expect(result.ok).toBe(false)
  })
})

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should use AbortController for timeout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'OK',
      text: () => Promise.resolve('OK'),
    } as any)

    const { fetchWithTimeout } = await import('@/lib/resilience')
    await fetchWithTimeout('https://example.com', { method: 'GET' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, options] = mockFetch.mock.calls[0]
    expect(options.signal).toBeDefined()
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
})
