const { createClient } = require('@supabase/supabase-js')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

const TABLES = [
  'jobs','enquiries','customers','password_requests','quotes','job_events',
  'notifications','sms_logs','email_logs','tracking_page_views','rate_limits',
  'send_in_requests','push_subscriptions','nf_hub_devices','quote_analytics_events',
  'missed_call_log','admin_settings','warranty_tickets','warranty_ticket_events',
  'sms_templates','email_templates','notification_config','magic_links',
  'inbound_dedup','conversation_messages','repairs','repair_updates','issues'
]

;(async () => {
  const svc = createClient(url, service)
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('=== Service-role existence + count ===')
  const existing = []
  for (const t of TABLES) {
    const { count, error } = await svc.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`${t}: does not exist (${(error.message||'').slice(0,60)})`)
    } else {
      console.log(`${t}: exists, ~${count} rows`)
      existing.push(t)
    }
  }

  console.log('\n=== Anon INSERT/UPDATE/DELETE test on existing tables ===')
  for (const t of existing) {
    // Try INSERT with a minimal bogus row (will likely fail on NOT NULL — but the error reveals whether RLS/privilege blocks first)
    const { error: insErr } = await anonC.from(t).insert({ __probe: true })
    const insMsg = insErr ? `${insErr.code || ''} ${(insErr.message||'').slice(0,70)}` : 'INSERT SUCCEEDED'
    // Try UPDATE
    const { error: updErr } = await anonC.from(t).update({ updated_at: new Date().toISOString() }).eq('id', '00000000-0000-0000-0000-000000000000')
    const updMsg = updErr ? `${updErr.code || ''} ${(updErr.message||'').slice(0,70)}` : 'UPDATE accepted (0 rows or more)'
    console.log(`${t}: insert=>${insMsg} | update=>${updMsg}`)
  }
})()
