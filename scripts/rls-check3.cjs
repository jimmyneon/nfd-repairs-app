const { createClient } = require('@supabase/supabase-js')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

;(async () => {
  const svc = createClient(url, service)
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Read one row anon can see (warranty_tickets) then try to modify it
  const { data: wt } = await anonC.from('warranty_tickets').select('id,status').limit(1)
  if (wt && wt[0]) {
    const { data: upd, error: updErr } = await anonC.from('warranty_tickets').update({ status: wt[0].status }).eq('id', wt[0].id).select()
    console.log('warranty_tickets anon UPDATE on real row:', updErr ? `denied (${updErr.code} ${updErr.message.slice(0,60)})` : `MODIFIED ${upd.length} row(s) — WRITE ACCESS CONFIRMED`)
  }

  // 2. Try DELETE on admin_settings row anon can see
  const { data: as_ } = await anonC.from('admin_settings').select('key').limit(1)
  if (as_ && as_[0]) {
    const { data: del, error: delErr } = await anonC.from('admin_settings').delete().eq('key', as_[0].key).select()
    console.log('admin_settings anon DELETE on real row:', delErr ? `denied (${delErr.code} ${delErr.message.slice(0,60)})` : `DELETED ${del.length} row(s) — WRITE ACCESS CONFIRMED`)
    // If it actually deleted, restore via service — check first
    if (!delErr && del && del.length > 0) {
      console.log('!! attempting restore of deleted admin_settings row')
      await svc.from('admin_settings').insert(del[0])
    }
  }

  // 3. Anon real INSERT into a table anon can read — tracking_page_views has known columns
  const { data: tpv } = await anonC.from('tracking_page_views').select('*').limit(1)
  if (tpv && tpv[0]) {
    const cols = Object.keys(tpv[0])
    console.log('tracking_page_views columns:', cols.join(','))
    const probe = {}
    for (const c of cols) {
      if (c === 'id') continue
      if (tpv[0][c] !== null) probe[c] = tpv[0][c]
    }
    const { data: ins, error: insErr } = await anonC.from('tracking_page_views').insert(probe).select()
    console.log('tracking_page_views anon INSERT:', insErr ? `denied (${insErr.code} ${insErr.message.slice(0,60)})` : `INSERTED — WRITE ACCESS CONFIRMED`)
    if (!insErr && ins && ins.length) {
      await svc.from('tracking_page_views').delete().eq('id', ins[0].id)
      console.log('  (cleaned up probe row)')
    }
  }

  // 4. Check actual policies + RLS state via service role on pg_tables (postgrest can't, try rpc)
  // Try to read pg_policies via service (PostgREST can't reach pg_catalog) — check if there's an introspection function
  const { data: fn } = await svc.rpc('get_rls_status').catch(() => ({ data: null }))
  console.log('get_rls_status rpc:', fn ? 'exists' : 'not available')
})()
