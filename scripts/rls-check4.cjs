const { createClient } = require('@supabase/supabase-js')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

;(async () => {
  const svc = createClient(url, service)
  // These returned ~null count — check if they're tables or views
  for (const t of ['customers','magic_links','inbound_dedup','repairs','repair_updates','issues']) {
    const { data, error } = await svc.from(t).select('*').limit(1)
    console.log(`${t}:`, error ? `err: ${error.message.slice(0,80)}` : `ok ${data.length} row(s), cols: ${data[0] ? Object.keys(data[0]).join(',').slice(0,80) : 'empty'}`)
  }
})()
