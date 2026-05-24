// Edge Function: delete the calling user's auth row and cascade-clean
// their profile. Deploy with `supabase functions deploy delete-account`.
//
// Flow:
//   1. Verify the caller's session against the user-scoped client.
//   2. Stamp profiles.deleted_at = now() so any back-end jobs notice the
//      row going away (e.g. async media cleanup).
//   3. Call auth.admin.deleteUser(userId) on the service-role client.
//      That cascades to public.profiles via the FK + ON DELETE CASCADE,
//      and from there to messages, posts, ledger entries, etc.
//
// CORS is wired so the Vite dev server can hit this directly.

// @ts-expect-error — Deno-resolved module path; works at runtime in
// Supabase Edge Functions, not in local TypeScript.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved module path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

declare const Deno: { env: { get(k: string): string | undefined } }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'missing bearer token' }, 401)
    }

    // User-scoped client — resolves auth.uid() from the JWT.
    const user = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: who, error: whoErr } = await user.auth.getUser()
    if (whoErr || !who?.user?.id) {
      return json({ error: 'not authenticated' }, 401)
    }
    const userId = who.user.id

    // Service-role client — bypasses RLS for the admin delete.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Soft mark on profiles for any downstream cleanup.
    await admin
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId)

    // 2) Hard-delete the auth user; FKs cascade.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) {
      return json({ error: delErr.message }, 500)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
