// Edge Function: a large pool of minimal-profile bot accounts
// (`profiles.bot_kind = 'liker'`) whose only job is to like real posts.
//
// Deliberately separate from feed-bot's persona roster (`bot_kind =
// 'persona'`): likers have no bio/interests/photo, are never seeded with
// `onboarded_at` set (which is what keeps them out of search results and
// the new-member/match-post notification fan-outs — see
// 0095_like_bots.sql's header for the full reasoning), and a like from one
// of them never generates a "X liked your post" notification (would be an
// obvious flood of synthetic activity otherwise).
//
// Two things happen depending on `action`:
//   - {"action":"seed","target":10000} → idempotently create liker accounts
//     up to `target` total, a bounded batch per call (re-call until the
//     response says the target is reached — see SETUP.md).
//   - default (tick) → sample a batch of real (non-bot) posts, and for each
//     one under its (deterministic, per-post) target like count, add a
//     handful more random likers via the `bot_add_likes` SQL function. Run
//     via pg_cron every 5 minutes so likes trickle in over many ticks
//     rather than landing on a post all at once — and most posts never get
//     anywhere near the full 10,000-bot pool, only whatever small subset
//     the per-post target and per-tick caps allow through.
//
// Unlike game-bot/chat-bot, likers never need a real signed-in session —
// `bot_add_likes` is a SECURITY DEFINER SQL function reachable only via the
// service-role client, so this function does everything with the service
// role, exactly like feed-bot's post/comment writes.
//
// Deploy:  npx supabase functions deploy like-bot --project-ref <ref>
// Secrets: npx supabase secrets set LIKE_BOT_SECRET=<any long random string>
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }
declare const crypto: { randomUUID(): string }

const DEFAULT_SEED_TARGET = 10_000
const MAX_SEED_PER_CALL = 300
const SEED_CONCURRENCY = 15

const CANDIDATE_POST_LIMIT = 40
const CANDIDATE_POST_WINDOW_DAYS = 30
const MAX_NEW_LIKES_PER_POST_PER_TICK = 8
const MAX_NEW_LIKES_PER_RUN = 150
// Deterministic per-post target so we don't need a stored column: hashes
// the post id into a stable ~5–255 range. Most posts settle well under the
// full bot pool; nothing ever aims for anywhere close to all 10,000.
const TARGET_MIN = 5
const TARGET_SPAN = 250

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Fail CLOSED: an unset secret must disable the function, not leave the
    // endpoint open to anyone holding the public anon key.
    const secret = Deno.env.get('LIKE_BOT_SECRET')
    if (!secret) return json({ error: 'function not configured (LIKE_BOT_SECRET unset)' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supaUrl || !svcKey) return json({ error: 'function not configured' }, 500)

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    let body: { action?: string; target?: number } = {}
    try { body = await req.json() } catch { /* empty body → default tick */ }

    if (body.action === 'seed') {
      return json(await seedLikers(admin, body.target ?? DEFAULT_SEED_TARGET))
    }

    // Liking is disabled for now — replaced by the Adam gallery flow.
    // Re-enable by uncommenting the line below (tick() itself is untouched,
    // just unreachable).
    // return json(await tick(admin))
    return json({ ok: true, disabled: 'liking is paused' })
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedLikers(admin: any, target: number) {
  const { count, error: countErr } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('bot_kind', 'liker')
  if (countErr) return { ok: false, error: countErr.message }

  const current = count ?? 0
  const remaining = Math.max(0, target - current)
  const toCreate = Math.min(remaining, MAX_SEED_PER_CALL)
  if (toCreate === 0) {
    return { ok: true, current, target, created: 0, done: true }
  }

  let created = 0
  const errors: string[] = []
  const batches = chunk(Array.from({ length: toCreate }), SEED_CONCURRENCY)

  for (const batch of batches) {
    const results = await Promise.all(batch.map(() => createOneLiker(admin)))
    for (const r of results) {
      if (r.ok) created++
      else errors.push(r.error)
    }
  }

  const newTotal = current + created
  return { ok: true, current: newTotal, target, created, done: newTotal >= target, errors: errors.slice(0, 5) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createOneLiker(admin: any): Promise<{ ok: true } | { ok: false; error: string }> {
  const handle = `lk${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  try {
    const { data: userRes, error: createErr } = await admin.auth.admin.createUser({
      email: `${handle}@lovemeet.bot.invalid`,
      password: crypto.randomUUID(), // never used — likes are written via service role
      email_confirm: true,
    })
    if (createErr || !userRes?.user) return { ok: false, error: createErr?.message ?? 'no user returned' }

    const gender = pick(['female', 'male', 'nonbinary', 'other', 'prefer_not_to_say'])
    const { error: updateErr } = await admin
      .from('profiles')
      .update({ is_bot: true, bot_kind: 'liker', handle, gender })
      // onboarded_at intentionally left null — see 0095_like_bots.sql header.
      .eq('id', userRes.user.id)
    if (updateErr) return { ok: false, error: updateErr.message }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Currently unreachable — liking is disabled, see the serve() handler above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
async function tick(admin: any) {
  const since = new Date(Date.now() - CANDIDATE_POST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: candidates } = await admin
    .from('posts')
    .select('id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300)
  if (!candidates || candidates.length === 0) return { ok: true, liked: 0 }

  const sample = shuffle(candidates).slice(0, CANDIDATE_POST_LIMIT)

  let totalAdded = 0
  const touched: number[] = []
  for (const post of sample) {
    if (totalAdded >= MAX_NEW_LIKES_PER_RUN) break

    const target = TARGET_MIN + (hash(post.id) % TARGET_SPAN)
    const { count } = await admin
      .from('post_likes')
      .select('user_id, profiles!inner(bot_kind)', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('profiles.bot_kind', 'liker')
    const current = count ?? 0
    if (current >= target) continue

    const take = Math.min(target - current, MAX_NEW_LIKES_PER_POST_PER_TICK, MAX_NEW_LIKES_PER_RUN - totalAdded)
    if (take <= 0) continue

    const { data: added, error } = await admin.rpc('bot_add_likes', { p_post_id: post.id, p_take: take })
    if (!error) {
      totalAdded += added ?? 0
      if (added) touched.push(added)
    }
  }

  return { ok: true, liked: totalAdded, postsTouched: touched.length }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Simple deterministic string hash (djb2) — stable per post id, no DB column needed.
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
