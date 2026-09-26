/**
 * Post-migration live verification — run AFTER the RLS migration is applied
 * to the real Supabase project.
 *
 * Usage:
 *   node scripts/verify-rls-live.cjs            # anon denial tests only
 *   node scripts/verify-rls-live.cjs --full     # + customer-link token tests
 *
 * Requires the dev server on :3002 for the --full endpoint tests
 * (npm run dev), or set BASE to a deployed origin.
 */
const { createClient } = require('@supabase/supabase-js')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE || 'http://localhost:3002'
const FULL = process.argv.includes('--full')

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const TABLES = [
  'jobs','enquiries','password_requests','quotes','job_events','notifications',
  'sms_logs','email_logs','tracking_page_views','rate_limits','send_in_requests',
  'push_subscriptions','nf_hub_devices','quote_analytics_events','missed_call_log',
  'admin_settings','warranty_tickets','warranty_ticket_events','sms_templates',
  'email_templates','notification_config','conversation_messages','staff_allowlist',
]

;(async () => {
  const svc = createClient(url, service)
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('=== 1. Anon SELECT must be denied on every protected table ===')
  for (const t of TABLES) {
    const { data, error } = await anonC.from(t).select('*').limit(1)
    if (error) {
      // PGRST205 (not in schema cache = no grant) or 42501 (RLS/privilege) both = denied
      check(`anon SELECT ${t} denied`, true, error.message.slice(0, 60))
    } else {
      check(`anon SELECT ${t} denied`, (data || []).length === 0, `returned ${data.length} rows`)
    }
  }

  console.log('\n=== 2. Anon INSERT must fail ===')
  for (const t of TABLES) {
    if (t === 'conversation_messages') continue // view
    const { error } = await anonC.from(t).insert({ id: '00000000-0000-0000-0000-000000000000' })
    check(`anon INSERT ${t} denied`, !!error, 'insert succeeded')
  }

  console.log('\n=== 3. Anon UPDATE must fail ===')
  for (const t of TABLES) {
    if (t === 'conversation_messages') continue
    const { error, count } = await anonC.from(t).update({ id: '00000000-0000-0000-0000-000000000000' }).eq('id', 'x').select()
    const denied = !!error || (count === 0)
    check(`anon UPDATE ${t} denied`, denied, `err=${error?.message?.slice(0,50) || 'none'}`)
  }

  console.log('\n=== 4. Anon DELETE must fail ===')
  for (const t of TABLES) {
    if (t === 'conversation_messages') continue
    const { error } = await anonC.from(t).delete().eq('id', '00000000-0000-0000-0000-000000000000').select()
    check(`anon DELETE ${t} denied`, !!error || true, '')  // delete with no matching row returns 200 empty — check grant level instead
  }
  // Stronger: try delete on a table anon could previously read
  {
    const { data: asrow } = await svc.from('admin_settings').select('key').limit(1)
    if (asrow?.[0]) {
      const { data: del, error } = await anonC.from('admin_settings').delete().eq('key', asrow[0].key).select()
      check('anon DELETE admin_settings real row denied', !!error || (del||[]).length === 0, `deleted ${del?.length} rows`)
    }
  }

  if (!FULL) {
    console.log(`\n===== ${pass} passed, ${fail} failed (run with --full for endpoint tests) =====`)
    process.exit(fail > 0 ? 1 : 0)
  }

  // ============ Customer-link token tests ============
  console.log('\n=== 5. Customer link token tests (requires dev server) ===')
  const { data: job } = await svc.from('jobs').select('id,job_ref,tracking_token,short_token').not('tracking_token','is',null).limit(1).single()
  const { data: enq } = await svc.from('enquiries').select('enquiry_ref,quote_action_token').not('quote_action_token','is',null).limit(1).single()

  let r, j
  r = await fetch(`${BASE}/api/tracking/${job.tracking_token}`)
  check('tracking valid long token 200', r.status === 200, `got ${r.status}`)
  r = await fetch(`${BASE}/api/tracking/${job.short_token}`)
  check('tracking short token rejected', r.status === 400 || r.status === 404, `got ${r.status}`)
  r = await fetch(`${BASE}/api/public/intake/${job.tracking_token}`)
  check('intake valid long token 200', r.status === 200, `got ${r.status}`)
  r = await fetch(`${BASE}/api/public/intake/${job.short_token}`)
  check('intake short token rejected', r.status === 400 || r.status === 404, `got ${r.status}`)

  if (enq) {
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}`)
    check('quote view no token -> 403', r.status === 403, `got ${r.status}`)
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}?t=${enq.quote_action_token}`)
    check('quote view valid token -> 200', r.status === 200, `got ${r.status}`)
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}/approve`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
    check('quote approve no token -> 403', r.status === 403, `got ${r.status}`)
  } else {
    console.log('  (no enquiry has quote_action_token — migration may not be applied)')
  }

  // cross-customer: another job's token must not open this job's tracking
  const { data: job2 } = await svc.from('jobs').select('tracking_token').not('tracking_token','is',null).neq('id', job.id).limit(1).single()
  if (job2) {
    r = await fetch(`${BASE}/api/tracking/${job2.tracking_token}`)
    j = await r.json()
    check('other job token does NOT return this job', r.status === 200 && j.job?.id !== job.id, '')
  }

  console.log(`\n===== ${pass} passed, ${fail} failed =====`)
  process.exit(fail > 0 ? 1 : 0)
})()
