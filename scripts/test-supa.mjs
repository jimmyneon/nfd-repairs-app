import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('URL set:', !!url, '| anon set:', !!anon, '| service set:', !!service)
const s = createClient(url, service)
const { data, error } = await s.from('jobs').select('id').limit(1)
console.log('service jobs query:', error ? error.message : `ok, ${(data||[]).length} row(s)`)
