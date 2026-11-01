import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Returns a plain-language problem, or null when the settings look right.
export function findConfigProblem(url?: string, key?: string): string | null {
  if (!url || !key) {
    return 'This copy of Deep freeze is not connected to Supabase yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  }
  if (key.startsWith('sb_secret_')) {
    return 'VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. Replace it with the publishable key, then rotate the secret key in Supabase.'
  }
  return null
}

export const configProblem = findConfigProblem(url, key)

// App.tsx shows a setup screen when configProblem is set, so nothing else
// touches this client without valid settings.
export const supabase = (
  configProblem
    ? null
    : createClient(url!, key!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // PKCE links only work in the browser that asked for them, but people
          // often open the email somewhere else.
          flowType: 'implicit',
        },
      })
) as SupabaseClient
