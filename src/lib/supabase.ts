import { createClient } from '@supabase/supabase-js'

/**
 * Trailing slashes are stripped.
 *
 * supabase-js builds every sub-client by concatenation — `${url}/rest/v1`,
 * `${url}/functions/v1` — so a URL ending in "/" produces a doubled slash in
 * the path. PostgREST tolerates it; the Functions gateway is less forgiving,
 * and the failure surfaces as the opaque "Failed to send a request to the
 * Edge Function" rather than anything that names a URL. Our own .env has the
 * trailing slash, so this is not hypothetical.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
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

/** Exported so callers that need a raw fetch can build a URL the same way. */
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey ?? ''

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-placeholder')
