import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), sendSms: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/resilience', () => ({
  sendViaMacroDroid: mocks.sendSms,
  isWithinUKSendingHours: () => true,
}))

import { POST as missedCall } from '@/app/api/macrodroid/missed-call/route'
import { POST as incomingText } from '@/app/api/messages/incoming/route'

describe('missed call followed by first text', () => {
  let tables: Record<string, Record<string, any>[]>
  let failedTable: string | undefined
  const now = '2026-09-21T10:00:00.000Z'
  const phone = '+447123456789'
  const request = (body: object) => new NextRequest('https://example.test/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const text = (number = phone, message = 'My phone has a cracked screen') =>
    incomingText(request({ phone: number, message }))
  const previousCall = (overrides: Record<string, any> = {}) => {
    tables.missed_call_log.push({ id: 'previous-call', phone, called_at: now, sms_sent: true, ...overrides })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    vi.stubEnv('MACRODROID_WEBHOOK_URL', 'https://example.test/sms')
    mocks.sendSms.mockResolvedValue({ ok: true })
    tables = { missed_call_log: [], sms_logs: [], notifications: [], enquiries: [], jobs: [], admin_settings: [], job_events: [] }
    failedTable = undefined

    // Exercise both real handlers against stored rows, applying their filters.
    // No provider or production database is contacted.
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        const filters: ((row: Record<string, any>) => boolean)[] = []
        let countOnly = false
        let maxRows = Infinity
        let orderColumn: string | undefined
        let ascending = true
        let update: Record<string, any> | undefined
        const query: any = {
          select: (_columns: string, options?: { head?: boolean }) => { countOnly = !!options?.head; return query },
          eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
          in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query },
          gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return query },
          contains: () => query,
          order: (key: string, options: { ascending: boolean }) => { orderColumn = key; ascending = options.ascending; return query },
          limit: (limit: number) => { maxRows = limit; return query },
          insert: async (values: Record<string, any>) => {
            tables[table].push({ id: `${table}-${tables[table].length}`, created_at: now, ...values })
            return { error: null }
          },
          update: (values: Record<string, any>) => { update = values; return query },
          then: (resolve: (result: unknown) => unknown) => {
            if (table === failedTable) return Promise.resolve({ data: null, count: null, error: { message: 'Read failed' } }).then(resolve)
            let rows = tables[table].filter(row => filters.every(filter => filter(row)))
            if (orderColumn) {
              const key = orderColumn
              rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1))
            }
            rows = rows.slice(0, maxRows)
            if (update) rows.forEach(row => Object.assign(row, update))
            return Promise.resolve({ data: countOnly ? null : rows, count: rows.length, error: null }).then(resolve)
          },
        }
        return query
      },
    })
  })

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('sends only one introduction across an actual missed-call → incoming-text sequence', async () => {
    expect((await missedCall(request({ from: phone }))).status).toBe(200)
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    expect(tables.missed_call_log[0].sms_sent).toBe(true)
    const result = await (await text()).json()
    expect(result.sms_sent).toBe(false)
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    expect(tables.notifications.some(row => row.type === 'ORPHAN_SMS' && row.body.includes('cracked screen'))).toBe(true)
  })

  it.each(['07123456789', '+44 7123 456789', '447123456789', '00447123456789'])(
    'recognises existing missed-call records when the reply number is %s', async number => {
      previousCall()
      expect((await (await text(number)).json()).sms_sent).toBe(false)
      expect(mocks.sendSms).not.toHaveBeenCalled()
      expect(tables.notifications).toHaveLength(1)
    },
  )

  it('recognises the repeat-caller introduction from SMS logs', async () => {
    tables.sms_logs.push({ template_key: 'MISSED_CALL_REPEAT', recipient_phone: '00447123456789', status: 'SENT', created_at: now })
    await text()
    expect(mocks.sendSms).not.toHaveBeenCalled()
  })

  it('still sends a welcome when the missed-call text failed', async () => {
    mocks.sendSms.mockResolvedValueOnce({ ok: false, body: 'Failed' }).mockResolvedValue({ ok: true })
    expect((await missedCall(request({ from: phone }))).status).toBe(502)
    expect((await (await text()).json()).sms_sent).toBe(true)
    expect(tables.sms_logs.at(-1)?.template_key).toBe('FIRST_TEXT_WELCOME')
  })

  it('does not suppress a different customer', async () => {
    previousCall({ phone: '+447987654321' })
    expect((await (await text()).json()).sms_sent).toBe(true)
  })

  it('allows a new introduction after the existing 24-hour window', async () => {
    previousCall({ called_at: '2026-09-20T09:59:59.000Z' })
    expect((await (await text()).json()).sms_sent).toBe(true)
  })

  it('still suppresses a successful welcome sent using another phone format', async () => {
    tables.sms_logs.push({ template_key: 'FIRST_TEXT_WELCOME', recipient_phone: '07123456789', status: 'SENT', created_at: now })
    await text()
    expect(mocks.sendSms).not.toHaveBeenCalled()
  })

  it('does not treat a failed welcome as a successful introduction', async () => {
    tables.sms_logs.push({ template_key: 'FIRST_TEXT_WELCOME', recipient_phone: phone, status: 'FAILED', created_at: now })
    expect((await (await text()).json()).sms_sent).toBe(true)
  })

  it.each(['sms_logs', 'missed_call_log'])('keeps the staff notification without risking a duplicate when %s cannot be read', async table => {
    failedTable = table
    expect((await (await text()).json()).sms_sent).toBe(false)
    expect(mocks.sendSms).not.toHaveBeenCalled()
    expect(tables.notifications).toHaveLength(1)
  })

  it.each([
    ['What time are you open?', 'OPENING_HOURS_REPLY'],
    ['UPDATE', 'ORPHAN_STATUS_REPLY'],
  ])('still answers the specific request: %s', async (message, templateKey) => {
    previousCall()
    expect((await (await text(phone, message)).json()).sms_sent).toBe(true)
    expect(tables.sms_logs.at(-1)?.template_key).toBe(templateKey)
  })
})
