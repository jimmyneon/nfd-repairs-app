import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/quotes/search/route'
import { matchesEnquirySearch, quoteSearchFilters } from '@/lib/enquiry-search'

vi.mock('@/lib/api-auth', () => ({
  requireStaffUser: async () => ({ response: null }),
}))

const quote = {
  enquiry_ref: 'ENQ26110001',
  customer_name: "Jo O'Connor",
  customer_email: null,
  customer_phone: '+44 (0)7700 900-123',
  device_make: 'Apple',
  device_model: 'iPhone 15 Pro',
  repair_type: 'Screen replacement',
  issue_description: 'Glass cracked after a fall',
}

describe('enquiry search', () => {
  it.each([
    "O'Connor", 'apple iphone 15', 'Screen replacement', 'cracked glass',
    'enq26110001', '  Jo  iPhone ', '07700 900123', '+44 7700 900123',
    '0044 7700 900123', '900123',
  ])('matches %s on a phone-only quote', (query) => {
    expect(matchesEnquirySearch(quote, query)).toBe(true)
  })

  it('safely skips incomplete quotes and ignores whitespace', () => {
    expect(matchesEnquirySearch(quote, 'nonexistent')).toBe(false)
    expect(matchesEnquirySearch({}, 'nonexistent')).toBe(false)
    expect(matchesEnquirySearch({}, '   ')).toBe(true)
  })

  it('keeps phone groups together and matches different UK formats in both directions', () => {
    expect(matchesEnquirySearch({ customer_phone: '07700900123' }, '+44 (7700) 900 123')).toBe(true)
    expect(matchesEnquirySearch({ ...quote, device_model: 'iPhone 07700' }, '07700 900124')).toBe(false)
    expect(matchesEnquirySearch({ customer_phone: '01590 123456' }, '+44 1590 123456')).toBe(true)
  })

  it('quotes PostgREST filter values and treats punctuation literally', () => {
    expect(quoteSearchFilters('Jo, "O\'Connor"', 'name')).toEqual([
      String.raw`customer_name.imatch."Jo, \"O'Connor\""`,
    ])
    expect(quoteSearchFilters(String.raw`A.*(B)\C`, 'name')).toEqual([
      String.raw`customer_name.imatch."A\\.\\*\\(B\\)\\\\C"`,
    ])
  })
})

describe('quote search route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('passes split device searches to the database before limiting results', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    const fetchMock = vi.fn(async (_url: string) => Response.json([quote]))
    vi.stubGlobal('fetch', fetchMock)
    const params = new URLSearchParams({ q: 'Apple iPhone 15', limit: '20' })
    const response = await GET(new NextRequest('http://localhost/api/quotes/search?' + params))

    expect(response.status).toBe(200)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('enquiry_type')).toBe('eq.repair_quote')
    expect(url.searchParams.get('converted_to_job')).toBe('not.is.true')
    expect(url.searchParams.get('converted_job_id')).toBe('is.null')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.getAll('or')).toHaveLength(3)
    expect(url.searchParams.getAll('or')[0]).toContain('device_make.imatch."Apple"')
    expect(url.searchParams.getAll('or')[1]).toContain('device_model.imatch."iPhone"')
    expect(await response.json()).toMatchObject({
      count: 1,
      quotes: [{ quote_request_id: quote.enquiry_ref, customer_email: null }],
    })
  })
})
