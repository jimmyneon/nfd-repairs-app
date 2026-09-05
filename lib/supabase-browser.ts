import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Return a no-op proxy during build when env vars aren't available
    return new Proxy({} as any, {
      get() {
        return () => Promise.resolve({ data: null, error: null })
      },
    })
  }
  return createBrowserClient<Database>(url, key)
}
