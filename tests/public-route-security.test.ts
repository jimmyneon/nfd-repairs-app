import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.NEXT_PUBLIC_APP_URL = 'https://nfd-repairs-app.vercel.app'
  process.env.PASSWORD_ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex key
  process.env.CRON_SECRET = 'test-cron-secret'
  process.env.STAFF_EMAILS = 'staff@example.com'
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// 1. RLS migration: verify every flagged table has ENABLE ROW LEVEL SECURITY
// ---------------------------------------------------------------------------

describe('RLS migration — every public table gets RLS', () => {
  const migrationPath = join(
    process.cwd(),
    'supabase/migrations/20260916120000_rls_and_quote_action_tokens.sql'
  )
  let sql: string
  try {
    sql = readFileSync(migrationPath, 'utf-8')
  } catch {
    sql = ''
  }

  const requiredTables = [
    'admin_settings',
    'warranty_tickets',
    'warranty_ticket_events',
    'missed_call_log',
    'tracking_page_views',
    'email_logs',
    'email_templates',
    'enquiries',
    'job_events',
    'jobs',
    'notification_config',
    'notifications',
    'password_requests',
    'push_subscriptions',
    'quote_analytics_events',
    'quotes',
    'rate_limits',
    'send_in_requests',
    'sms_logs',
    'sms_templates',
  ]

  // The migration iterates over a table-name array inside DO blocks, so
  // each required table must appear in the array literals AND there must
  // be an ENABLE ROW LEVEL SECURITY statement driven by that array.
  it('enables RLS via a DO block iterating all required tables', () => {
    expect(sql).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    for (const table of requiredTables) {
      expect(sql, `migration must cover ${table}`).toMatch(new RegExp(`'${table}'`))
    }
  })

  it('adds quote_action_token columns to jobs and enquiries', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+jobs[\s\S]*?quote_action_token/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+enquiries[\s\S]*?quote_action_token/i)
  })

  it('backfills tokens for existing rows', () => {
    expect(sql).toMatch(/UPDATE\s+jobs[\s\S]*?quote_action_token\s*=\s*encode\(gen_random_bytes/i)
    expect(sql).toMatch(/UPDATE\s+enquiries[\s\S]*?quote_action_token\s*=\s*encode\(gen_random_bytes/i)
  })

  it('backfills token expiry so issued tokens always have one', () => {
    expect(sql).toMatch(/quote_action_token_expires_at\s*=\s*NOW\(\)\s*\+\s*INTERVAL/i)
  })

  it('sets a DEFAULT on quote_action_token so new rows always get one', () => {
    expect(sql).toMatch(/ALTER\s+COLUMN\s+quote_action_token\s+SET\s+DEFAULT/i)
  })

  it('revokes direct table grants from anon', () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON[\s\S]*?FROM\s+anon/i)
  })

  it('revokes blanket PUBLIC grants', () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON[\s\S]*?FROM\s+PUBLIC/i)
  })

  it('does NOT rely on USING(false) deny policies (they cannot override permissive ones)', () => {
    // Supabase policies are additive/ORed. The correct protections are
    // REVOKE + RLS-enabled + no permissive policies — not deny policies.
    // Strip -- comments so explanatory text doesn't trip the regex.
    const code = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    expect(code).not.toMatch(/USING\s*\(\s*false\s*\)/i)
    expect(code).not.toMatch(/WITH\s+CHECK\s*\(\s*false\s*\)/i)
  })

  it('drops every existing policy before creating staff-only ones', () => {
    expect(sql).toMatch(/pg_policies/i)
    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS/i)
  })

  it('gates authenticated access through is_staff(), not bare USING(true)', () => {
    expect(sql).toMatch(/is_staff\(\)/i)
    expect(sql).not.toMatch(/TO\s+authenticated\s+USING\s*\(\s*true\s*\)/i)
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'authenticated'/i)
  })

  it('creates and seeds staff_allowlist from existing auth.users', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.staff_allowlist/i)
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.staff_allowlist[\s\S]*?auth\.users/i)
  })

  it('handles conversation_messages as a view via security_invoker, not RLS', () => {
    expect(sql).toMatch(/security_invoker/i)
    // Must NOT try to CREATE POLICY on the view (would error).
    expect(sql).not.toMatch(/CREATE\s+POLICY[\s\S]*?ON\s+(?:public\.)?conversation_messages/i)
  })

  it('grants service_role full access (bypasses RLS)', () => {
    expect(sql).toMatch(/GRANT\s+ALL\s+ON[\s\S]*?TO\s+service_role/i)
  })
})

// ---------------------------------------------------------------------------
// 2. Tracking endpoint: response field allowlist
// ---------------------------------------------------------------------------

describe('Tracking endpoint — field allowlist', () => {
  it('does not select prohibited fields from jobs', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/tracking/[token]/route.ts'),
      'utf-8'
    )
    // The select string must NOT contain these internal/sensitive fields.
    // customer_notes, diagnostic_report, description and job_ref are
    // free-text/internal fields that could carry staff notes, PII,
    // passcodes, serial numbers, addresses or sensitive diagnosis details
    // — they are not returned to the customer at all.
    const prohibited = [
      'tracking_token',
      'short_token',
      'customer_notes',
      'diagnostic_report',
      'diagnosis_notes',
      'description',
      'job_ref',
      'delay_reason',
      'delay_notes',
      'cancellation_reason',
      'cancellation_notes',
      'repair_declined_reason',
      'customer_phone',
      'customer_email',
      'customer_name',
      'device_password',
      'customer_address',
    ]
    for (const field of prohibited) {
      const selectMatch = route.match(/\.select\(`([\s\S]*?)`\)/)
      if (selectMatch) {
        expect(selectMatch[1], `tracking select must not include ${field}`).not.toMatch(
          new RegExp(`\\b${field}\\b`)
        )
      }
    }
  })

  it('matches the LONG tracking_token only — short_token is never an authority', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/tracking/[token]/route.ts'),
      'utf-8'
    )
    // Must query by tracking_token only; no OR with short_token.
    expect(route).toMatch(/\.eq\('tracking_token',\s*token\)/)
    expect(route).not.toMatch(/or\(`tracking_token\.eq\.[^`]*short_token/)
    // Must reject tokens shorter than 10 chars (short_token is 6-8).
    expect(route).toMatch(/token\.length\s*<\s*10/)
  })

  it('strips tracking_link_expires_at from the response', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/tracking/[token]/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/delete\s+job\.tracking_link_expires_at/)
  })

  it('applies rate limiting', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/tracking/[token]/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/checkRateLimit/)
  })

  it('never sends raw job_events.message to the browser — returns parsed status only', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/tracking/[token]/route.ts'),
      'utf-8'
    )
    // The API must parse the status server-side and return {created_at, status},
    // not the raw staff-authored message string.
    expect(route).toMatch(/statusLabelToKey|Status changed to/)
    // The returned events must not carry the raw `message` field.
    expect(route).not.toMatch(/message:\s*e\.message/)
    expect(route).toMatch(/status:\s*label\s*\?/)
  })

  it('customer-arrived endpoint requires the long tracking token, not just jobId', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/notifications/customer-arrived/route.ts'),
      'utf-8'
    )
    // Must require both jobId and token, and verify token belongs to that job.
    expect(route).toMatch(/token\.length\s*<\s*10/)
    expect(route).toMatch(/\.eq\('tracking_token',\s*token\)/)
    expect(route).toMatch(/Invalid token/)
    expect(route).toMatch(/checkRateLimit/)
  })
})

// ---------------------------------------------------------------------------
// 3. Intake endpoint: no device_password leakage
// ---------------------------------------------------------------------------

describe('Intake endpoint — device password protection', () => {
  it('response never echoes device_password value', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/intake/[token]/route.ts'),
      'utf-8'
    )
    // The response must be an explicit allowlist, not a spread of the row
    // with device_password set to undefined. job_ref and description are
    // legitimately returned: job_ref is the customer's own booking
    // reference shown on the page, and description is the customer's own
    // submitted text returned to them for editing.
    expect(route).toMatch(/job_ref:\s*data\.job_ref/)
    expect(route).not.toMatch(/device_password:\s*undefined/)
    // The response object must not spread ...data (which would leak fields).
    const responseBlock = route.match(/return NextResponse\.json\(\{[\s\S]*?\}\)/)
    if (responseBlock) {
      expect(responseBlock[0]).not.toMatch(/\.\.\.data\b/)
    }
  })

  it('exposes only has_device_password boolean, not the value', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/intake/[token]/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/has_device_password:\s*Boolean\(data\.device_password\)/)
  })

  it('does not return tracking_token in the response', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/intake/[token]/route.ts'),
      'utf-8'
    )
    const responseBlock = route.match(/return NextResponse\.json\(\{[\s\S]*?\}\)/)
    if (responseBlock) {
      expect(responseBlock[0]).not.toMatch(/tracking_token/)
    }
  })

  it('applies rate limiting to GET and PATCH', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/intake/[token]/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/checkRateLimit\(ip,\s*'intake:get'/)
    expect(route).toMatch(/checkRateLimit\(ip,\s*'intake:patch'/)
  })
})

// ---------------------------------------------------------------------------
// 4. Walk-in endpoint: no phone-based PII lookup, token-gated updates
// ---------------------------------------------------------------------------

describe('Walk-in endpoint — enumeration and update protection', () => {
  it('does not implement a phone-lookup mode that returns customer data', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/walk-in/submit/route.ts'),
      'utf-8'
    )
    expect(route).not.toMatch(/body\.lookup\s*===\s*true/)
    expect(route).not.toMatch(/found:\s*true,\s*job:/)
  })

  it('requires a LONG token to update an existing job by job_id', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/walk-in/submit/route.ts'),
      'utf-8'
    )
    // The update branch must check for a token.
    expect(route).toMatch(/Authorisation token required to update a booking/)
    // The lookup must match the LONG tracking_token only — short_token is
    // 6-char hex (~24 bits) and must never authorise customer data.
    expect(route).toMatch(/\.eq\('tracking_token',\s*token\)/)
    expect(route).not.toMatch(/or\(`tracking_token\.eq\.[^`]*short_token/)
    // Must explicitly deny when a job_id was supplied but the token does
    // not authorise it (no silent fallthrough to create).
    expect(route).toMatch(/Invalid or expired authorisation token/)
  })

  it('applies rate limiting', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/walk-in/submit/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/checkRateLimit\(ip,\s*'walk-in:submit'/)
  })
})

// ---------------------------------------------------------------------------
// 5. Quote routes: token-authorised, rate-limited
// ---------------------------------------------------------------------------

describe('Quote routes — token authorisation', () => {
  it('view route reads the token from ?t= and validates it', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/searchParams\.get\('t'\)/)
    expect(route).toMatch(/isQuoteActionTokenValid/)
    expect(route).toMatch(/Invalid or expired quote link/)
    expect(route).toMatch(/checkRateLimit\(ip,\s*'quote:view'/)
  })

  it('view route has NO NULL-token bypass — a missing stored token always denies', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )
    // Must explicitly reject when the stored token is null/empty.
    expect(route).toMatch(/!\w+\.quote_action_token\s*\|\|/)
    // Must not have a conditional that only validates when a token exists.
    expect(route).not.toMatch(/if\s*\(\w+\.quote_action_token\)\s*\{[\s\S]*?isQuoteActionTokenValid/)
  })

  it('approve route validates the token before mutating', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/quote/[ref]/approve/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/searchParams\.get\('t'\)/)
    expect(route).toMatch(/isQuoteActionTokenValid/)
    expect(route).toMatch(/Invalid or expired quote link/)
    expect(route).toMatch(/checkRateLimit\(ip,\s*'quote:approve'/)
    expect(route).toMatch(/!\w+\.quote_action_token\s*\|\|/)
  })

  it('reject route validates the token before mutating', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/quote/[ref]/reject/route.ts'),
      'utf-8'
    )
    expect(route).toMatch(/searchParams\.get\('t'\)/)
    expect(route).toMatch(/isQuoteActionTokenValid/)
    expect(route).toMatch(/Invalid or expired quote link/)
    expect(route).toMatch(/checkRateLimit\(ip,\s*'quote:reject'/)
    expect(route).toMatch(/!\w+\.quote_action_token\s*\|\|/)
  })

  it('view route does not use select("*")', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )
    expect(route).not.toMatch(/\.select\('\*'\)/)
  })
})

// ---------------------------------------------------------------------------
// 6. Quote link generation includes the token
// ---------------------------------------------------------------------------

describe('Quote link generation — token embedded', () => {
  it('shortQuoteApprovalLink appends ?t= when a token is provided', async () => {
    const { shortQuoteApprovalLink } = await import('@/lib/utils')
    const link = shortQuoteApprovalLink('NF-12345', 'abc123token')
    expect(link).toMatch(/\/q\/NF-12345\?t=abc123token/)
  })

  it('shortQuoteApprovalLink omits ?t= when no token is provided (legacy)', async () => {
    const { shortQuoteApprovalLink } = await import('@/lib/utils')
    const link = shortQuoteApprovalLink('NF-12345')
    expect(link).toMatch(/\/q\/NF-12345$/)
    expect(link).not.toMatch(/\?t=/)
  })

  it('generateQuoteActionToken returns a 64-char hex string', async () => {
    const { generateQuoteActionToken } = await import('@/lib/job-utils')
    const token = generateQuoteActionToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(token.length).toBe(64)
  })

  it('isQuoteActionTokenValid rejects missing token', async () => {
    const { isQuoteActionTokenValid } = await import('@/lib/job-utils')
    expect(isQuoteActionTokenValid(null, null, null)).toBe(false)
    expect(isQuoteActionTokenValid(undefined, undefined, undefined)).toBe(false)
  })

  it('isQuoteActionTokenValid rejects token with NULL expiry (fail closed)', async () => {
    const { isQuoteActionTokenValid } = await import('@/lib/job-utils')
    // A stored token with no expiry was never issued securely — deny.
    expect(isQuoteActionTokenValid('sometoken', null, null)).toBe(false)
    expect(isQuoteActionTokenValid('sometoken', undefined, null)).toBe(false)
  })

  it('isQuoteActionTokenValid rejects revoked token', async () => {
    const { isQuoteActionTokenValid } = await import('@/lib/job-utils')
    expect(isQuoteActionTokenValid('sometoken', null, '2025-01-01')).toBe(false)
  })

  it('isQuoteActionTokenValid rejects expired token', async () => {
    const { isQuoteActionTokenValid } = await import('@/lib/job-utils')
    const past = new Date(Date.now() - 86400000).toISOString()
    expect(isQuoteActionTokenValid('sometoken', past, null)).toBe(false)
  })

  it('isQuoteActionTokenValid accepts a valid, non-expired token', async () => {
    const { isQuoteActionTokenValid } = await import('@/lib/job-utils')
    const future = new Date(Date.now() + 86400000).toISOString()
    expect(isQuoteActionTokenValid('sometoken', future, null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Rate limiting coverage on public form routes
// ---------------------------------------------------------------------------

describe('Rate limiting — public form routes', () => {
  const routesToCheck = [
    'app/api/public/start-repair/route.ts',
    'app/api/public/business-enquiry/route.ts',
    'app/api/password/submit/route.ts',
    'app/api/jobs/get-by-token/route.ts',
    'app/api/tracking/view/route.ts',
  ]

  for (const routePath of routesToCheck) {
    it(`${routePath} applies rate limiting`, () => {
      const route = readFileSync(join(process.cwd(), routePath), 'utf-8')
      expect(route).toMatch(/checkRateLimit/)
    })
  }
})
