// Edge Function: bot accounts that play live games as a real opponent.
//
// Reuses the `is_bot` roster seeded by supabase/functions/feed-bot (see that
// file's header for the content policy — same rules apply here: no bot ever
// claims to be a real dateable person via photos). This function adds two
// new capabilities for those same personas:
//
//   - Lobby fill: if a real user creates a 1v1 game and nobody joins within
//     ~45s, a bot joins automatically via the ordinary `join_game` RPC — the
//     exact same path a human opponent would take. No new client UI.
//   - Live moves: for every active game a bot is in, compute and submit its
//     next move for whichever game_type it is (Number Duel binary search,
//     Draughts via the ported rules engine in ./draughts.ts, Pixel Rush via
//     a randomized "solve time" — see the per-game-type comments below for
//     why each approach fits that game's actual mechanics).
//
// Game RPCs and `touch_last_seen()` key off `auth.uid()`, so — unlike
// feed-bot, which writes directly as the service role — this function signs
// in as the ACTING bot user for every game action. That requires every bot
// account to share one known password (never exposed to end users), set via
// the one-time {"action":"prepare"} call.
//
// Schedule: supabase/migrations/0094_game_chat_bot.sql (pg_cron + pg_net,
// every minute — matches the existing sweep_games() cadence in
// 0057_game_autosweep.sql, so the bot never lags behind the AFK-sweep's own
// reminder/forfeit windows).
//
// Deploy:  npx supabase functions deploy game-bot --project-ref <ref>
// Secrets: npx supabase secrets set GAME_BOT_SECRET=<any long random string>
//          npx supabase secrets set BOT_ACCOUNT_PASSWORD=<any long random string>
//          SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { isLost, pickMove, type Board } from './draughts.ts'

declare const Deno: { env: { get(k: string): string | undefined } }

// Same verified non-human image pool as feed-bot — fine to reuse for Pixel
// Rush's "turn player uploads the target picture" step.
const IMAGE_POOL_IDS = [10, 20, 28, 29, 30, 40, 76, 96, 106, 110, 140, 152, 160, 190, 200, 211, 225, 237, 249, 260, 271]
function randomImageUrl(): string {
  const id = IMAGE_POOL_IDS[Math.floor(Math.random() * IMAGE_POOL_IDS.length)]
  return `https://picsum.photos/id/${id}/1080/1080`
}

const LOBBY_MIN_AGE_MS = 45_000
const MAX_LOBBY_FILLS_PER_RUN = 5
const MAX_CONCURRENT_GAMES_PER_BOT = 3
const PIXEL_SOLVE_MIN_ELAPSED_MS = 9_000
const PIXEL_SOLVE_CHANCE_PER_TICK = 0.5

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Fail CLOSED: an unset secret must disable the function, not leave the
    // endpoint open — the "prepare" action resets persona passwords.
    const secret = Deno.env.get('GAME_BOT_SECRET')
    if (!secret) return json({ error: 'function not configured (GAME_BOT_SECRET unset)' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const botPassword = Deno.env.get('BOT_ACCOUNT_PASSWORD')
    if (!supaUrl || !svcKey || !anonKey || !botPassword) {
      return json({ error: 'function not configured' }, 500)
    }

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    let body: { action?: string } = {}
    try { body = await req.json() } catch { /* empty body → default tick */ }

    if (body.action === 'prepare') {
      return json(await prepareBots(admin, botPassword))
    }

    return json(await tick(admin, supaUrl, anonKey, botPassword))
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function prepareBots(admin: any, botPassword: string) {
  const { data: bots, error } = await admin
    .from('profiles').select('id, handle, coins').eq('is_bot', true).eq('bot_kind', 'persona')
  if (error) return { ok: false, error: error.message }

  const updated: string[] = []
  const toppedUp: string[] = []
  const errors: string[] = []

  for (const bot of bots ?? []) {
    try {
      const { error: pwErr } = await admin.auth.admin.updateUserById(bot.id, { password: botPassword })
      if (pwErr) { errors.push(`${bot.handle}: ${pwErr.message}`); continue }
      updated.push(bot.handle)

      if ((bot.coins ?? 0) < 20) {
        const { error: coinErr } = await admin.rpc('apply_coins', {
          p_user: bot.id, p_delta: 50, p_kind: 'admin_adjust', p_note: 'game-bot top-up',
        })
        if (coinErr) errors.push(`${bot.handle} top-up: ${coinErr.message}`)
        else toppedUp.push(bot.handle)
      }
    } catch (e) {
      errors.push(`${bot.handle}: ${(e as Error).message}`)
    }
  }

  return { ok: true, updated, toppedUp, errors }
}

function signInAsBot(supaUrl: string, anonKey: string, handle: string, password: string) {
  const client = createClient(supaUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return client.auth.signInWithPassword({ email: `${handle}@lovemeet.bot.invalid`, password }).then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error }: any) => {
      if (error) throw new Error(`sign-in failed for ${handle}: ${error.message}`)
      return client
    },
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tick(admin: any, supaUrl: string, anonKey: string, botPassword: string) {
  const { data: bots, error: botsErr } = await admin
    .from('profiles').select('id, handle').eq('is_bot', true).eq('bot_kind', 'persona')
  if (botsErr) return { ok: false, error: botsErr.message }
  if (!bots || bots.length === 0) {
    return { ok: true, joined: 0, moved: 0, note: 'no bots seeded yet — call {"action":"seed"} on feed-bot first' }
  }
  const botIds: string[] = bots.map((b: { id: string }) => b.id)
  const botHandleById = new Map<string, string>(bots.map((b: { id: string; handle: string }) => [b.id, b.handle]))

  // Cache one signed-in client per bot per tick — several actions may share a bot.
  const sessionCache = new Map<string, Promise<unknown>>()
  function clientFor(botId: string) {
    const handle = botHandleById.get(botId)!
    if (!sessionCache.has(botId)) sessionCache.set(botId, signInAsBot(supaUrl, anonKey, handle, botPassword))
    return sessionCache.get(botId)!
  }

  const joined = await fillLobbies(admin, botIds, clientFor)
  const moved = await playActiveGames(admin, botIds, clientFor)

  return { ok: true, joined, moved }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fillLobbies(admin: any, botIds: string[], clientFor: (id: string) => Promise<any>): Promise<number> {
  const cutoff = new Date(Date.now() - LOBBY_MIN_AGE_MS).toISOString()
  const { data: candidates } = await admin
    .from('games')
    .select('id, invite_code, max_players, host_id')
    .eq('status', 'lobby')
    .eq('kind', '1v1')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(20)
  if (!candidates || candidates.length === 0) return 0

  // Bot's current concurrent-active-game load, for the per-bot cap.
  const { data: activeRows } = await admin
    .from('game_players')
    .select('user_id, games!inner(status)')
    .in('user_id', botIds)
    .eq('games.status', 'active')
  const loadByBot = new Map<string, number>()
  for (const row of activeRows ?? []) {
    loadByBot.set(row.user_id, (loadByBot.get(row.user_id) ?? 0) + 1)
  }

  let joined = 0
  for (const game of candidates) {
    if (joined >= MAX_LOBBY_FILLS_PER_RUN) break
    if (botIds.includes(game.host_id)) continue // never fill a bot-hosted lobby

    const { count } = await admin
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', game.id)
    if ((count ?? 0) >= game.max_players) continue

    const { data: existingBot } = await admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', game.id)
      .in('user_id', botIds)
      .maybeSingle()
    if (existingBot) continue

    const available = botIds
      .filter((id) => (loadByBot.get(id) ?? 0) < MAX_CONCURRENT_GAMES_PER_BOT)
      .sort(() => Math.random() - 0.5)
    if (available.length === 0) break // every bot is already busy enough

    const botId = available[0]
    try {
      const client = await clientFor(botId)
      const { error } = await client.rpc('join_game', { p_code: game.invite_code })
      if (error) throw new Error(error.message)
      loadByBot.set(botId, (loadByBot.get(botId) ?? 0) + 1)
      joined++
    } catch {
      // Coin shortfall, race with a real human joining, etc. — skip this
      // lobby this tick; it'll be retried (or a human will have joined by
      // then) on the next run.
      continue
    }
  }
  return joined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function playActiveGames(admin: any, botIds: string[], clientFor: (id: string) => Promise<any>): Promise<number> {
  const { data: rows } = await admin
    .from('game_players')
    .select('user_id, game_id, games!inner(id, status, game_type, current_round)')
    .in('user_id', botIds)
    .eq('games.status', 'active')
  if (!rows || rows.length === 0) return 0

  let moved = 0
  for (const row of rows) {
    const botId: string = row.user_id
    const game = row.games as { id: string; game_type: string; current_round: number }
    try {
      const client = await clientFor(botId)
      await client.rpc('touch_last_seen') // presence heartbeat — avoids being auto-forfeited as "stale"

      let didMove = false
      if (game.game_type === 'number_duel') didMove = await playNumberDuel(client, game.id, game.current_round, botId)
      else if (game.game_type === 'draughts') didMove = await playDraughts(client, game.id, game.current_round, botId)
      else didMove = await playPixelRush(client, game.id, game.current_round, botId)

      if (didMove) moved++
    } catch {
      continue // one bot/game failing shouldn't block the rest of the tick
    }
  }
  return moved
}

// =============================================================================
// Number Duel — the server exposes exact higher/lower/correct feedback on a
// bounded numeric range, so classic binary search converges reliably. We only
// submit ONE guess per tick (rebuilding the search bounds from this bot's own
// prior guesses in `duel_guesses` each time) so the bot "thinks" for a few
// minutes across ticks instead of solving the round instantly.
// =============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function playNumberDuel(client: any, gameId: string, round: number, botId: string): Promise<boolean> {
  const { data: r } = await client
    .from('duel_rounds')
    .select('status')
    .eq('game_id', gameId).eq('round_no', round)
    .maybeSingle()
  if (!r) return false

  if (r.status === 'picking') {
    const { data: mine } = await client
      .from('duel_secrets')
      .select('user_id')
      .eq('game_id', gameId).eq('round_no', round).eq('user_id', botId)
      .maybeSingle()
    if (mine) return false
    const secret = Math.round(Math.random() * 1000) / 10 // 0.0–100.0
    const { error } = await client.rpc('set_duel_secret', { p_game_id: gameId, p_round: round, p_secret: secret })
    return !error
  }

  if (r.status === 'guessing') {
    const { data: priorGuesses } = await client
      .from('duel_guesses')
      .select('value, feedback')
      .eq('game_id', gameId).eq('round_no', round).eq('guesser_id', botId)
      .order('created_at', { ascending: true })

    let lo = 0, hi = 100
    for (const g of priorGuesses ?? []) {
      const value = Number(g.value)
      if (g.feedback === 'higher') lo = Math.max(lo, value)
      else if (g.feedback === 'lower') hi = Math.min(hi, value)
    }
    const guess = Math.round(((lo + hi) / 2) * 10) / 10
    const { error } = await client.rpc('submit_duel_guess', { p_game_id: gameId, p_round: round, p_value: guess })
    return !error
  }

  return false
}

// =============================================================================
// Draughts — the server trusts the client for move legality, so the bot
// computes its own move with the ported rules engine (./draughts.ts) rather
// than guessing. Bot is always color 'b' (it only ever joins as the
// non-host — see 0081_draughts.sql's _draughts_player_color).
// =============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function playDraughts(client: any, gameId: string, round: number, botId: string): Promise<boolean> {
  const { data: r } = await client
    .from('draughts_rounds')
    .select('board, turn_user_id, status')
    .eq('game_id', gameId).eq('round_no', round)
    .maybeSingle()
  if (!r || r.status !== 'playing' || r.turn_user_id !== botId) return false

  const board = r.board as Board
  if (isLost(board, 'b')) {
    const { error } = await client.rpc('concede_draughts_round', { p_game_id: gameId, p_round: round })
    return !error
  }

  const move = pickMove(board, 'b')
  if (!move) return false

  const { error } = await client.rpc('submit_draughts_move', {
    p_game_id: gameId, p_round: round,
    p_from_r: move.from.r, p_from_c: move.from.c,
    p_to_r: move.to.r, p_to_c: move.to.c,
    p_captures: move.captures,
  })
  return !error
}

// =============================================================================
// Pixel Rush — the race itself (tile scramble/solve) is entirely client-side
// and derived from a seed both players compute identically; there's nothing
// for a bot to "solve." On its turn it just uploads a target image; while
// racing, it waits a plausible amount of time before calling submit_solve
// with a randomized time — so the human sometimes wins the round too.
// =============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function playPixelRush(client: any, gameId: string, round: number, botId: string): Promise<boolean> {
  const { data: r } = await client
    .from('game_rounds')
    .select('status, turn_user_id, winner_player, started_at')
    .eq('game_id', gameId).eq('round_no', round)
    .maybeSingle()
  if (!r) return false

  if (r.status === 'awaiting_image' && r.turn_user_id === botId) {
    const { error } = await client.rpc('set_round_image', { p_game_id: gameId, p_round: round, p_image: randomImageUrl() })
    return !error
  }

  if (r.status === 'racing' && !r.winner_player) {
    const elapsed = r.started_at ? Date.now() - Date.parse(r.started_at) : 0
    if (elapsed < PIXEL_SOLVE_MIN_ELAPSED_MS) return false
    if (Math.random() > PIXEL_SOLVE_CHANCE_PER_TICK) return false
    const timeMs = Math.round(elapsed + (Math.random() * 4000 - 2000))
    const { error } = await client.rpc('submit_solve', { p_game_id: gameId, p_round: round, p_time_ms: Math.max(3000, timeMs) })
    return !error
  }

  return false
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
