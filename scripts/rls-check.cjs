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
  'inbound_dedup','conversation_messages','repairs','repair_updates','issues',
  'repair_requests','repairs_archive'
]

;(async () => {
  const svc = createClient(url, service)
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('=== Table existence + anon SELECT test ===')
  for (const t of TABLES) {
    // service check table exists
    const { error: svcErr } = await svc.from(t).select('*', { count: 'exact', head: true })
    if (svcErr && /does not exist|Could not find|relation.*does not exist/i.test(svcErr.message || '')) {
      console.log(`${t}: TABLE DOES NOT EXIST`)
      continue
    }
    // anon select
    const { data, error, count } = await anonC.from(t).select('*', { count: 'exact', head: false }).limit(3)
    if (error) {
      console.log(`${t}: anon SELECT denied (${error.code || ''} ${error.message.slice(0,60)})`)
    } else {
      console.log(`${t}: ⚠️  ANON SELECT returned ${data?.length ?? 0} rows (total ~${count ?? '?'})`)
    }
  }
})()
