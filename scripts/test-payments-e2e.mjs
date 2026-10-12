#!/usr/bin/env node
/**
 * End-to-end test of the Stripe payments stack against `npm run dev`.
 *
 * Exercises, for real:
 *   1. POST /api/repair-fund/create          → creates a repair fund
 *   2. POST /api/payments/checkout           → real test-mode Stripe session
 *   3. POST /api/webhooks/stripe             → properly-signed fake
 *      checkout.session.completed event      → verifies the paid cascade
 *   4. GET  /api/repair-fund/status          → balance should be updated
 *   5. GET  /api/payments/session-status     → retrieves the test session
 *   6. GET  /api/payments/due                → 404 on unknown token
 *
 * Requires: npm run dev on :3000 with .env.development.local containing
 *           sk_test keys + STRIPE_WEBHOOK_SECRET, and the payments migration
 *           applied to the project Supabase.
 *
 * Usage: node scripts/test-payments-e2e.mjs [baseUrl]
 */

import crypto from 'node:crypto'

const BASE = process.argv[2] || 'http://localhost:3000'
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_localtest1234567890abcdef'

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} — ${detail}`)
  }
}

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

/** Sign a webhook payload the same way Stripe does. */
function stripeSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signed = `${timestamp}.${payload}`
  const v1 = crypto.createHmac('sha256', secret).update(signed).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

async function supaDelete(table, col, val) {
  await fetch(`${SUPA_URL}/rest/v1/${table}?${col}=eq.${val}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  })
}

async function main() {
  console.log(`\nPayments E2E — ${BASE}\n`)

  // ---- 1. Create a repair fund -------------------------------------------
  console.log('1. Create repair fund')
  const create = await post('/api/repair-fund/create', {
    customer_name: 'E2E Test',
    customer_phone: '07123456789',
    device_summary: 'TestPhone X',
    repair_summary: 'screen test',
    target_amount: 100,
  })
  check('fund created', create.status === 200 && !!create.body.fund_token,
    JSON.stringify(create.body))
  const fundToken = create.body.fund_token
  if (!fundToken) return summary()

  // ---- 2. Create a top-up checkout ----------------------------------------
  console.log('2. Create fund top-up checkout (£50)')
  const checkout = await post('/api/payments/checkout', {
    kind: 'fund_topup',
    fund_token: fundToken,
    amount: 50,
    return_url: 'https://newforestdevicerepairs.co.uk/repair-fund/?f=x',
  })
  check('checkout created', checkout.status === 200 && !!checkout.body.url,
    JSON.stringify(checkout.body))
  if (!checkout.body.url) return summary()

  // Session id is recoverable from the hosted-page URL
  const sessionId = checkout.body.url.match(/cs_(test|live)_[\w]+/)?.[0]
  check('session id extracted', !!sessionId, checkout.body.url)

  // ---- 3. Fire a correctly-signed webhook ---------------------------------
  console.log('3. Signed checkout.session.completed webhook')
  const event = {
    id: 'evt_e2e_test',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        amount_total: 5000,
        currency: 'gbp',
        payment_status: 'paid',
        status: 'complete',
        payment_intent: 'pi_e2e_test',
        customer_details: { email: 'e2e@test.dev' },
        metadata: {
          kind: 'fund_topup',
          repair_fund_id: 'SELF', // resolved from payments row instead
          fund_token: fundToken,
        },
      },
    },
  }
  const payload = JSON.stringify(event)
  const wh = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': stripeSignature(payload, webhookSecret),
    },
    body: payload,
  })
  check('webhook accepted', wh.status === 200, `status ${wh.status}`)

  // Bad signature must be rejected
  const bad = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 't=1,v1=bad',
    },
    body: payload,
  })
  check('bad signature rejected', bad.status === 400, `status ${bad.status}`)

  // ---- 4. Fund balance should have incremented ----------------------------
  console.log('4. Fund status after webhook')
  const status = await get(
    `/api/repair-fund/status?token=${fundToken}`
  )
  check(
    'balance incremented by £50',
    status.status === 200 && status.body.balance_pence === 5000,
    JSON.stringify(status.body)
  )
  check('fund still open (target not reached)', status.body.status === 'open')

  // ---- 4b. Webhook redelivery must not double-count -----------------------
  console.log('4b. Duplicate webhook delivery')
  const replay = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': stripeSignature(payload, webhookSecret),
    },
    body: payload,
  })
  check('redelivery accepted (200)', replay.status === 200, `status ${replay.status}`)
  const status2 = await get(`/api/repair-fund/status?token=${fundToken}`)
  check('balance still £50 — no double-count', status2.body.balance_pence === 5000,
    JSON.stringify(status2.body))

  // ---- 5. Session-status verifies the real test session -------------------
  console.log('5. Session-status on the test session')
  const ss = await get(`/api/payments/session-status?session_id=${sessionId}`)
  check('session-status returned session', ss.status === 200 && ss.body.kind === 'fund_topup',
    JSON.stringify(ss.body))

  // ---- 6. Unknown token 404 -----------------------------------------------
  console.log('6. /due with unknown token')
  const due = await get('/api/payments/due?token=deadbeef00')
  check('unknown token → 404', due.status === 404, `status ${due.status}`)

  // ---- 7. Create-from-quote, redeem, recover -------------------------------
  console.log('7. Quote-linked fund: create, fund, redeem')
  const enqRef = 'ENQ-E2E' + Date.now().toString(36).toUpperCase()
  const enqToken = 'e2e-quote-token'
  const insEnq = await fetch(`${SUPA_URL}/rest/v1/enquiries`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      enquiry_ref: enqRef,
      enquiry_type: 'repair_quote',
      customer_name: 'E2E Quote',
      customer_phone: '07123456789',
      quoted_price: 80,
      device_make: 'TestPhone',
      device_model: 'X',
      repair_type: 'screen',
      status: 'pending',
      quote_action_token: enqToken,
      quote_action_token_expires_at: new Date(Date.now() + 864e5).toISOString(),
    }),
  })
  check('test enquiry inserted', insEnq.ok, `status ${insEnq.status}`)

  const badToken = await post('/api/repair-fund/create', { enquiry_ref: enqRef, t: 'wrong' })
  check('bad quote token → 403', badToken.status === 403, `status ${badToken.status}`)

  const qFund = await post('/api/repair-fund/create', { enquiry_ref: enqRef, t: enqToken })
  check('fund created from quote', qFund.status === 200 && !!qFund.body.fund_token,
    JSON.stringify(qFund.body))
  const qToken = qFund.body.fund_token

  if (qToken) {
    const qStatus = await get(`/api/repair-fund/status?token=${qToken}`)
    check('target prefilled from quote (£80)', qStatus.body.target_pence === 8000,
      JSON.stringify(qStatus.body))

    const qCheckout = await post('/api/payments/checkout', {
      kind: 'fund_topup', fund_token: qToken, amount: 80,
      return_url: 'https://newforestdevicerepairs.co.uk/repair-fund/?f=x',
    })
    const qSid = qCheckout.body?.url?.match(/cs_(test|live)_[\w]+/)?.[0]
    check('full-fund checkout created', !!qSid, JSON.stringify(qCheckout.body))

    if (qSid) {
      const qEvent = {
        id: 'evt_e2e_fund2', object: 'event', type: 'checkout.session.completed',
        data: { object: {
          id: qSid, object: 'checkout.session', amount_total: 8000, currency: 'gbp',
          payment_status: 'paid', status: 'complete', payment_intent: 'pi_e2e_2',
          customer_details: {}, metadata: { kind: 'fund_topup' },
        }},
      }
      const qPayload = JSON.stringify(qEvent)
      const qWh = await fetch(`${BASE}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(qPayload, webhookSecret) },
        body: qPayload,
      })
      check('funding webhook accepted', qWh.status === 200, `status ${qWh.status}`)

      const fundedStatus = await get(`/api/repair-fund/status?token=${qToken}`)
      check('fund now funded', fundedStatus.body.status === 'funded',
        JSON.stringify(fundedStatus.body))

      const redeem = await post('/api/repair-fund/redeem', { token: qToken })
      check('redeem applied £80', redeem.status === 200 && redeem.body.applied_pence === 8000,
        JSON.stringify(redeem.body))

      const redeem2 = await post('/api/repair-fund/redeem', { token: qToken })
      check('second redeem is a no-op', redeem2.body.already_redeemed === true,
        JSON.stringify(redeem2.body))

      const enqCheck = await fetch(
        `${SUPA_URL}/rest/v1/enquiries?enquiry_ref=eq.${enqRef}&select=payment_received`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      ).then(r => r.json())
      check('enquiry flagged payment_received', enqCheck[0]?.payment_received === true,
        JSON.stringify(enqCheck))

      await supaDelete('payments', 'stripe_session_id', qSid)
    }
    await supaDelete('payments', 'enquiry_ref', enqRef)
    await supaDelete('repair_funds', 'fund_token', qToken)
  }

  const recover = await post('/api/repair-fund/recover', { customer_phone: '07123456789' })
  check('recover returns generic ok', recover.status === 200 && recover.body.ok === true,
    JSON.stringify(recover.body))

  await supaDelete('enquiries', 'enquiry_ref', enqRef)

  // ---- 8. Job deposit → balance lifecycle ----------------------------------
  console.log('8. Job deposit + balance')
  const insJob = await fetch(`${SUPA_URL}/rest/v1/jobs`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      customer_name: 'E2E Job', customer_phone: '07123456789',
      device_make: 'TestPhone', device_model: 'X', issue: 'screen test',
      price_total: 80, status: 'AWAITING_DEPOSIT',
      deposit_required: true, deposit_amount: 20, type: 'repair',
    }),
  })
  const jobRows = insJob.ok ? await insJob.json() : null
  const job = Array.isArray(jobRows) ? jobRows[0] : null
  check('test job created', !!job?.tracking_token, `status ${insJob.status}`)

  if (job?.tracking_token) {
    const due1 = await get(`/api/payments/due?token=${job.tracking_token}`)
    check('due shows £20 deposit', due1.body.deposit_due_pence === 2000,
      JSON.stringify(due1.body))

    const depCheckout = await post('/api/payments/checkout', {
      kind: 'job_deposit', token: job.tracking_token,
      return_url: 'https://newforestdevicerepairs.co.uk/pay/thanks/',
    })
    const depSid = depCheckout.body?.url?.match(/cs_(test|live)_[\w]+/)?.[0]
    check('deposit checkout created', !!depSid, JSON.stringify(depCheckout.body))

    if (depSid) {
      const depEvent = {
        id: 'evt_e2e_dep', object: 'event', type: 'checkout.session.completed',
        data: { object: {
          id: depSid, object: 'checkout.session', amount_total: 2000, currency: 'gbp',
          payment_status: 'paid', status: 'complete', payment_intent: 'pi_e2e_dep',
          customer_details: {}, metadata: { kind: 'job_deposit' },
        }},
      }
      const depPayload = JSON.stringify(depEvent)
      const depWh = await fetch(`${BASE}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(depPayload, webhookSecret) },
        body: depPayload,
      })
      check('deposit webhook accepted', depWh.status === 200, `status ${depWh.status}`)

      const jobAfter = await fetch(
        `${SUPA_URL}/rest/v1/jobs?id=eq.${job.id}&select=deposit_received,payment_received`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      ).then(r => r.json())
      check('job.deposit_received flipped', jobAfter[0]?.deposit_received === true,
        JSON.stringify(jobAfter))

      const due2 = await get(`/api/payments/due?token=${job.tracking_token}`)
      check('due shows £60 balance after deposit', due2.body.balance_due_pence === 6000,
        JSON.stringify(due2.body))

      const balCheckout = await post('/api/payments/checkout', {
        kind: 'job_payment', token: job.tracking_token,
        return_url: 'https://newforestdevicerepairs.co.uk/pay/thanks/',
      })
      const balSid = balCheckout.body?.url?.match(/cs_(test|live)_[\w]+/)?.[0]
      check('balance checkout created for £60', !!balSid, JSON.stringify(balCheckout.body))

      if (balSid) {
        const balEvent = {
          id: 'evt_e2e_bal', object: 'event', type: 'checkout.session.completed',
          data: { object: {
            id: balSid, object: 'checkout.session', amount_total: 6000, currency: 'gbp',
            payment_status: 'paid', status: 'complete', payment_intent: 'pi_e2e_bal',
            customer_details: {}, metadata: { kind: 'job_payment' },
          }},
        }
        const balPayload = JSON.stringify(balEvent)
        await fetch(`${BASE}/api/webhooks/stripe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(balPayload, webhookSecret) },
          body: balPayload,
        })
        const jobFinal = await fetch(
          `${SUPA_URL}/rest/v1/jobs?id=eq.${job.id}&select=payment_received`,
          { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        ).then(r => r.json())
        check('job.payment_received flipped', jobFinal[0]?.payment_received === true,
          JSON.stringify(jobFinal))
        await supaDelete('payments', 'stripe_session_id', balSid)
      }
      await supaDelete('payments', 'stripe_session_id', depSid)
    }
    await supaDelete('payments', 'job_id', job.id)
    await supaDelete('job_events', 'job_id', job.id)
    await supaDelete('jobs', 'id', job.id)
  }

  // ---- cleanup -------------------------------------------------------------
  console.log('cleanup: removing test rows')
  await supaDelete('payments', 'stripe_session_id', sessionId)
  await supaDelete('repair_funds', 'fund_token', fundToken)

  return summary()
}

function summary() {
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('E2E crashed:', e)
  process.exit(1)
})
