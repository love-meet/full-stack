// auth-telegram — verifies a Telegram Mini-App initData payload and returns
// a Supabase magic-link action_url the client follows to sign in.
//
// Deploy with: supabase functions deploy auth-telegram --no-verify-jwt
// (the --no-verify-jwt is required because the caller is anonymous — they
// don't have a Supabase session yet; that's what they're trying to get.)
//
// Required env (set with `supabase secrets set ...`):
//   TELEGRAM_BOT_TOKEN      — the bot's HTTP API token from @BotFather
//   SUPABASE_URL            — provided automatically in the Edge Function env
//   SUPABASE_SERVICE_ROLE_KEY — provided automatically in the Edge Function env
//   PUBLIC_SITE_URL         — e.g. https://lovemeet.app (used as magic-link redirect)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SUPA_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPA_ADMIN = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SITE_URL   = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!BOT_TOKEN || !SUPA_URL || !SUPA_ADMIN) {
    return json({ error: 'server is not configured (missing env vars)' }, 500)
  }

  const body = await req.json().catch(() => null) as { initData?: string } | null
  const initData = body?.initData
  if (!initData || typeof initData !== 'string') {
    return json({ error: 'initData required' }, 400)
  }

  // 1. Verify the HMAC signature.
  const verified = await verifyTelegramInitData(initData, BOT_TOKEN)
  if (!verified.ok) return json({ error: verified.reason }, 401)
  const tg = verified.user

  // 2. Find or create the corresponding Supabase auth user.
  const admin = createClient(SUPA_URL, SUPA_ADMIN, { auth: { persistSession: false } })
  const syntheticEmail = `tg_${tg.id}@telegram.lovemeet.invalid`

  // Look up by email first (cheap), fall back to create.
  let userId: string | null = null
  {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) return json({ error: 'lookup failed: ' + error.message }, 500)
    // listUsers does NOT support search-by-email natively; the easier path is
    // to attempt createUser and treat the duplicate-email error as "already exists",
    // then look it up. Implemented below.
    void data
  }

  const createRes = await admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: {
      telegram_user_id: tg.id,
      telegram_username: tg.username ?? null,
      display_name: [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || null,
      avatar_url: tg.photo_url ?? null,
      auth_provider: 'telegram',
    },
  })

  if (createRes.error) {
    // Existing user — fish out the id via getUserByEmail-equivalent.
    // (Workaround: query the profiles table by telegram_user_id, which is
    // backfilled by the on_auth_user_created trigger.)
    const { data: existing, error: fetchErr } = await admin
      .from('profiles')
      .select('id')
      .eq('telegram_user_id', tg.id)
      .maybeSingle()
    if (fetchErr || !existing) {
      return json({ error: 'create failed and lookup failed: ' + (createRes.error.message ?? '') }, 500)
    }
    userId = existing.id
  } else {
    userId = createRes.data.user.id
  }

  // 3. Generate a magic-link action URL. The client navigates to it; Supabase
  //    sets cookies (or returns to PUBLIC_SITE_URL with the session in the
  //    URL hash, depending on the flow type).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: syntheticEmail,
    options: { redirectTo: SITE_URL },
  })
  if (linkErr || !linkData) return json({ error: 'sign-in link failed: ' + (linkErr?.message ?? '') }, 500)

  return json({
    action_url: linkData.properties.action_link,
    user_id: userId,
    telegram_user: tg,
  })
})

// ----- helpers -----

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

type Verified =
  | { ok: true; user: TelegramUser }
  | { ok: false; reason: string }

async function verifyTelegramInitData(initData: string, botToken: string): Promise<Verified> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'missing hash' }
  params.delete('hash')

  // Telegram's spec: data_check_string is the sorted-by-key concatenation of
  // remaining key=value pairs joined by \n.
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  // secret_key = HMAC_SHA256(key='WebAppData', data=botToken)
  const enc = new TextEncoder()
  const secretKey = await crypto.subtle.importKey(
    'raw',
    await hmac(enc.encode('WebAppData'), enc.encode(botToken)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', secretKey, enc.encode(dataCheckString))
  const computed = [...new Uint8Array(sigBytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (computed !== hash) return { ok: false, reason: 'bad signature' }

  // Freshness: reject if auth_date is older than 1 day.
  const authDate = Number(params.get('auth_date') ?? '0')
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    return { ok: false, reason: 'initData expired' }
  }

  const userJson = params.get('user')
  if (!userJson) return { ok: false, reason: 'missing user' }
  const user = JSON.parse(userJson) as TelegramUser
  if (typeof user.id !== 'number') return { ok: false, reason: 'malformed user' }

  return { ok: true, user }
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, data)
  return new Uint8Array(sig)
}
