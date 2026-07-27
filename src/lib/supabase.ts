import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env.local and fill in the project credentials.',
  )
}

/** False when the env vars were missing at build time — the app boots with a
 *  dead placeholder client and every backend call silently fails. App.tsx
 *  checks this and shows an explicit config-error screen instead of letting
 *  a misconfigured deploy masquerade as a working app with dead buttons. */
export const supabaseConfigured = !!url && !!anonKey

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-placeholder')
