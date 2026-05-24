// Edge Function: FX rates (USD-based) for local-currency display.
//
// Returns the cached rates from public.fx_rates, refreshing from
// ExchangeRate-API at most once a day (when the cache is older than ~20h).
// The API key lives ONLY here as a secret — never in the browser. One
// refresh per day total keeps us inside the free 1,500 req/month quota.
//
// Deploy:  npx supabase functions deploy fx-rates --project-ref <ref>
// Secret:  npx supabase secrets set EXCHANGERATE_API_KEY=<key> --project-ref <ref>

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js sends apikey + x-client-info on functions.invoke — all must
  // be allowed here or the browser's preflight blocks the request.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const MAX_AGE_MS = 20 * 60 * 60 * 1000 // ~20h → refreshes about once a day

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const apiKey  = Deno.env.get('EXCHANGERATE_API_KEY')
  const supaUrl = Deno.env.get('SUPABASE_URL')
  const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supaUrl || !svcKey) return json({ error: 'function not configured' }, 500)

  const admin = createClient(supaUrl, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: cached } = await admin
    .from('fx_rates')
    .select('base, rates, fetched_at')
    .eq('id', 1)
    .maybeSingle()

  const fresh = cached && (Date.now() - new Date(cached.fetched_at).getTime() < MAX_AGE_MS)
  if (fresh) return json({ base: cached.base, rates: cached.rates, fetched_at: cached.fetched_at })

  // Stale or missing → refresh from ExchangeRate-API (USD base).
  if (apiKey) {
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`)
      const body = await res.json()
      if (res.ok && body?.result === 'success' && body?.conversion_rates) {
        const row = {
          id: 1,
          base: body.base_code ?? 'USD',
          rates: body.conversion_rates,
          fetched_at: new Date().toISOString(),
        }
        await admin.from('fx_rates').upsert(row)
        return json({ base: row.base, rates: row.rates, fetched_at: row.fetched_at })
      }
    } catch { /* fall through to cached */ }
  }

  // Refresh failed — serve the last good cache if we have it.
  if (cached) return json({ base: cached.base, rates: cached.rates, fetched_at: cached.fetched_at })
  return json({ error: 'no rates available' }, 503)
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
