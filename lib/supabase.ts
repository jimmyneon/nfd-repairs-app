import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './types'

let _supabase: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      // Return a no-op proxy during build when env vars aren't available
      return new Proxy({} as SupabaseClient<Database>, {
        get() {
          return () => Promise.resolve({ data: null, error: null })
        },
      }) as any
    }
    _supabase = createClient<Database>(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    })
  }
  return _supabase
}

// Backwards-compatible proxy that lazily creates the client
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return Reflect.get(getSupabase(), prop)
  },
})

export { type Database }
