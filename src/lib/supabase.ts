import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True once both env vars are set. Until then the app runs on the local
 * offline store so you can build and demo before the Supabase project exists.
 * Only the anon key ever reaches the browser — security is enforced by RLS.
 */
export const hasSupabase = Boolean(url && anonKey && url.startsWith('http'))

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
