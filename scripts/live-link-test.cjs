const { createClient } = require('@supabase/supabase-js')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = 'http://localhost:3002'
let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}
;(async () => {
  const svc = createClient(url, service)

  // Warm up dev server (first request compiles the route)
  await fetch(`${BASE}/api/tracking/warmup-warmup-warmup`).catch(() => {})
  await fetch(`${BASE}/api/public/intake/warmup-warmup-warmup`).catch(() => {})
  await new Promise(r => setTimeout(r, 1500))

  // ---- Setup: find a real job + enquiry ----
  const { data: job } = await svc.from('jobs').select('id,job_ref,tracking_token,short_token').not('tracking_token','is',null).limit(1).single()
  console.log('Test job:', job.job_ref, '| long token:', job.tracking_token.slice(0,8)+'…', '| short:', job.short_token)

  // ============ TRACKING ============
  console.log('\n--- Tracking /api/tracking/[token] ---')
  let r = await fetch(`${BASE}/api/tracking/${job.tracking_token}`)
  let j = await r.json()
  const tj = j.job || {}
  check('valid long token returns 200', r.status === 200, `got ${r.status}`)
  check('response has no tracking_token', tj.tracking_token === undefined)
  check('response has no short_token', tj.short_token === undefined)
  check('response has no customer_notes', tj.customer_notes === undefined)
  check('response has no diagnostic_report', tj.diagnostic_report === undefined)
  check('response has no description', tj.description === undefined)
  check('response has no job_ref', tj.job_ref === undefined)
  check('response has no customer_phone/email/name', !tj.customer_phone && !tj.customer_email && !tj.customer_name)
  check('response has status', tj.status !== undefined)
  check('response has device_make', tj.device_make !== undefined)

  r = await fetch(`${BASE}/api/tracking/${job.short_token}`)
  check('short token REJECTED (not authority)', r.status === 400 || r.status === 404, `got ${r.status}`)

  r = await fetch(`${BASE}/api/tracking/00000000-0000-0000-0000-000000000000`)
  check('invalid long token returns 404', r.status === 404, `got ${r.status}`)

  r = await fetch(`${BASE}/api/tracking/abcdef1234`)  // valid-length but non-existent
  check('non-existent token returns 404', r.status === 404, `got ${r.status}`)

  // ============ INTAKE ============
  console.log('\n--- Intake /api/public/intake/[token] ---')
  r = await fetch(`${BASE}/api/public/intake/${job.tracking_token}`)
  j = await r.json()
  check('valid long token returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(j).slice(0,80)}`)
  check('no device_password in response', j.job && j.job.device_password === undefined)
  check('has_device_password is boolean', typeof j.job?.has_device_password === 'boolean')
  check('no tracking_token leaked', j.job?.tracking_token === undefined && j.tracking_token === undefined)
  check('no job id leaked', j.job?.id === undefined)

  r = await fetch(`${BASE}/api/public/intake/${job.short_token}`)
  check('short token REJECTED for intake', r.status === 400 || r.status === 404, `got ${r.status}`)

  r = await fetch(`${BASE}/api/public/intake/00000000-0000-0000-0000-000000000000`)
  check('invalid long token returns 404', r.status === 404, `got ${r.status}`)

  // ============ QUOTE ============
  console.log('\n--- Quote /api/public/quote/[ref] ---')
  const { data: enq } = await svc.from('enquiries').select('enquiry_ref,quote_action_token').not('quote_action_token','is',null).limit(1).single()
  if (enq) {
    console.log('Test enquiry:', enq.enquiry_ref, '| token:', enq.quote_action_token.slice(0,8)+'…')
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}`)
    check('no token -> 403', r.status === 403, `got ${r.status}`)
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}?t=wrongtoken123`)
    check('wrong token -> 403', r.status === 403, `got ${r.status}`)
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}?t=${enq.quote_action_token}`)
    j = await r.json()
    check('valid token -> 200', r.status === 200, `got ${r.status}`)
    check('quote returns customer fields', j.device_make !== undefined)
    check('quote has no quote_action_token in resp', j.quote_action_token === undefined)
    // approve without token
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}/approve`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
    check('approve no token -> 403', r.status === 403, `got ${r.status}`)
    r = await fetch(`${BASE}/api/public/quote/${enq.enquiry_ref}/reject`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
    check('reject no token -> 403', r.status === 403, `got ${r.status}`)
  } else {
    console.log('  (no enquiry with quote_action_token yet — migration not applied)')
  }

  // ============ WALK-IN update auth ============
  console.log('\n--- Walk-in update /api/public/walk-in/submit ---')
  // update existing job_id without token
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'X', customer_phone:'07123', job_id: job.id }) })
  check('update without token -> 403', r.status === 403, `got ${r.status}`)
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'X', customer_phone:'07123', job_id: job.id, token: job.short_token }) })
  check('update with short token -> 403', r.status === 403, `got ${r.status}`)
  // Valid long token but wrong source (not walk_in_self) must also fail
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'X', customer_phone:'07123', job_id: job.id, token: job.tracking_token }) })
  check('update non-walk-in job w/ valid token -> 403', r.status === 403, `got ${r.status}`)

  // Real walk-in job: create one, then update it with the returned long token
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'WALKIN-TEST', customer_phone:'07999000111', device_make:'Apple', device_model:'iPhone 12', issue:'Screen' }) })
  let wj = await r.json()
  check('walk-in create returns 200 + long tracking_token', r.status === 200 && typeof wj.tracking_token === 'string' && wj.tracking_token.length >= 10, `got ${r.status}`)
  const walkinJobId = wj.job_id
  const walkinToken = wj.tracking_token
  const walkinShort = wj.short_token

  // update walk-in job WITHOUT token -> 403
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'WALKIN-TEST', customer_phone:'07999000111', job_id: walkinJobId }) })
  check('walk-in update without token -> 403', r.status === 403, `got ${r.status}`)
  // update with short token -> 403
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'WALKIN-TEST', customer_phone:'07999000111', job_id: walkinJobId, token: walkinShort }) })
  check('walk-in update with short token -> 403', r.status === 403, `got ${r.status}`)
  // update with another job's token -> 403
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'WALKIN-TEST', customer_phone:'07999000111', job_id: walkinJobId, token: job.tracking_token }) })
  check('walk-in update with wrong job token -> 403', r.status === 403, `got ${r.status}`)
  // update with correct long token -> 200
  r = await fetch(`${BASE}/api/public/walk-in/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ customer_name:'WALKIN-TEST', customer_phone:'07999000111', job_id: walkinJobId, token: walkinToken, device_make:'Apple', device_model:'iPhone 12', issue:'Battery' }) })
  j = await r.json()
  check('walk-in update with correct long token -> 200', r.status === 200 && j.success === true, `got ${r.status}`)

  // cleanup test job
  await svc.from('job_events').delete().eq('job_id', walkinJobId)
  await svc.from('notifications').delete().eq('job_id', walkinJobId)
  await svc.from('tracking_page_views').delete().eq('job_id', walkinJobId)
  await svc.from('jobs').delete().eq('id', walkinJobId)

  console.log(`\n===== ${pass} passed, ${fail} failed =====`)
  process.exit(fail > 0 ? 1 : 0)
})()
