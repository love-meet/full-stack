// link-telegram — exchanges a one-shot link token + Telegram Mini App initData
// for a magic-link that signs the user into an EXISTING auth account.
//
// Used by the cross-surface identity-linking flow: a user signed in with
// Google on the web taps "Open in Telegram", we mint a link token, embed it
// in the Telegram deep link as start_param, and when the Mini App opens it
// calls this function instead of the regular auth-telegram one.
//
// Difference from auth-telegram:
//   • auth-telegram creates a NEW Supabase auth user keyed by the Telegram
//     user id, leading to a duplicate account.
//   • link-telegram looks up the EXISTING auth user from the link token,
//     attaches telegram_user_id to that account, and returns a magic link
//     for that account's email.
//
// Deploy:
//   supabase functions deploy link-telegram --no-verify-jwt --project-ref <ref>
//
// Required env (already set for auth-telegram):
//   TELEGRAM_BOT_TOKEN       — bot's HTTP API token from @BotFather
//   SUPABASE_URL             — provided by platform
//   SUPABASE_SERVICE_ROLE_KEY — provided by platform
//   PUBLIC_SITE_URL          — used as magic-link redirectTo

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

  const body = await req.json().catch(() => null) as
    | { link_token?: string; initData?: string }
    | null
  const linkToken = body?.link_token
  const initData = body?.initData
  if (!linkToken || !initData) {
    return json({ error: 'link_token + initData required' }, 400)
  }

  // 1. Verify the Telegram HMAC — exactly the same as auth-telegram.
  const verified = await verifyTelegramInitData(initData, BOT_TOKEN)
  if (!verified.ok) return json({ error: verified.reason }, 401)
  const tg = verified.user

  const admin = createClient(SUPA_URL, SUPA_ADMIN, { auth: { persistSession: false } })

  // 2. Atomically consume the link token. The conditions in the WHERE make
  //    this race-safe — only one caller can flip consumed_at on a row.
  const { data: tokenRow, error: tokenErr } = await admin
    .from('link_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', linkToken)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id')
    .maybeSingle()

  if (tokenErr) {
    return json({ error: 'token lookup failed: ' + tokenErr.message }, 500)
  }
  if (!tokenRow) {
    return json({ error: 'link token invalid, expired, or already used' }, 400)
  }
  const existingUserId = tokenRow.user_id as string

  // 3. Pull the existing auth user — we need their email for the magic
  //    link and their current metadata so we don't blow it away.
  const { data: existingUserRes, error: getUserErr } =
    await admin.auth.admin.getUserById(existingUserId)
  if (getUserErr || !existingUserRes?.user) {
    return json({ error: 'existing user not found' }, 404)
  }
  const existingUser = existingUserRes.user
  const existingMeta = (existingUser.user_metadata ?? {}) as Record<string, unknown>
  const existingTelegramId = existingMeta.telegram_user_id

  // 4. Safety: if this account is already linked to a DIFFERENT Telegram
  //    user, refuse — the human needs to pick one identity, not silently
  //    have it overwritten.
  if (
    typeof existingTelegramId === 'number' &&
    existingTelegramId !== tg.id
  ) {
    return json({
      error:
        'This Love meet account is already linked to a different Telegram account. Contact support if you need to switch.',
    }, 409)
  }

  // 5. Safety: if this Telegram user is already a profile on a DIFFERENT
  //    Love meet account, refuse — that's the Tier-3 merge case, not auto.
  const { data: clash, error: clashErr } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', tg.id)
    .neq('id', existingUserId)
    .maybeSingle()
  if (clashErr) {
    return json({ error: 'profile lookup failed: ' + clashErr.message }, 500)
  }
  if (clash) {
    return json({
      error:
        'This Telegram account is already linked to a different Love meet account. Contact support to merge them.',
    }, 409)
  }

  // 6. Attach telegram_user_id to the EXISTING auth user's metadata. Merge
  //    with whatever was there so we don't lose Google sub, avatar, etc.
  const newMeta = {
    ...existingMeta,
    telegram_user_id: tg.id,
    telegram_username: tg.username ?? null,
    auth_provider_secondary: 'telegram',
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(
    existingUserId,
    { user_metadata: newMeta },
  )
  if (updErr) {
    return json({ error: 'user update failed: ' + updErr.message }, 500)
  }

  // 7. Mirror onto the profile row so RLS / app queries see the link.
  //    on_auth_user_created normally writes this; doing it explicitly here
  //    because the user already exists.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      telegram_user_id: tg.id,
      telegram_username: tg.username ?? null,
    })
    .eq('id', existingUserId)
  if (profileErr) {
    // Don't fail the whole flow — the auth user_metadata is the source of
    // truth and is already updated. The profile row will catch up on next
    // touch_last_seen or onboarded update.
    console.warn('profile update warning:', profileErr.message)
  }

  // 8. Generate a magic link for the EXISTING user's email. This is what
  //    actually signs them in inside the Mini App when navigated to.
  const userEmail = existingUser.email
  if (!userEmail) {
    return json({ error: 'existing user has no email' }, 500)
  }
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: { redirectTo: SITE_URL },
    })
  if (linkErr || !linkData) {
    return json({
      error: 'sign-in link failed: ' + (linkErr?.message ?? 'unknown'),
    }, 500)
  }

  return json({
    action_url: linkData.properties.action_link,
    user_id: existingUserId,
    linked: true,
  })
})

// ----- helpers (mirrored from auth-telegram for HMAC verification) ---------

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

async function verifyTelegramInitData(
  initData: string,
  botToken: string,
): Promise<Verified> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'missing hash' }
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

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
