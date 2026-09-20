// End-to-end check against the LOCAL Supabase stack.
//
//   npx supabase start && node scripts/e2e-local-check.mjs
//
// Exercises the calls the app actually makes, as a real signed-in user with
// RLS enforced. That last part is the point: psql as postgres bypasses RLS
// entirely, so it cannot tell you whether a policy lets the guesser read the
// word, or whether one user can read another's credit history. This can.
//
// It caught a bug that migration rehearsal could not: respond_chat_game
// assigned a CASE (text) to an enum column, which applies cleanly as DDL and
// then fails at runtime on every single game accept.
//
// The keys below are the standard Supabase local-dev keys. They are public,
// identical on every machine, and reach nothing but 127.0.0.1.
const API = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

let pass = 0, fail = 0
const ok  = (n, c, d = '') => { c ? (pass++, console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`)) }

async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json; try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: r.status, json }
}
const rpc = (fn, args, token) => rest(`rpc/${fn}`, { token, method: 'POST', body: args })

async function signup(email) {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test123456!' }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('signup failed: ' + JSON.stringify(j).slice(0, 300))
  return { token: j.access_token, id: j.user.id }
}

const stamp = Date.now()

console.log('\n=== 1. SIGNUP (§4) ===')
const alice = await signup(`alice.${stamp}@lovemeet.local`)
const bob   = await signup(`bob.${stamp}@lovemeet.local`)
ok('two users created', !!alice.id && !!bob.id)

// The signup grant fires on profile insert, read back under RLS.
let a = await rest(`profiles?select=coins&id=eq.${alice.id}`, { token: alice.token })
ok('new user holds exactly 1000 credits (§2)', a.json?.[0]?.coins === 1000, `got ${a.json?.[0]?.coins}`)

let led = await rest(`coin_ledger?select=kind,delta&user_id=eq.${alice.id}`, { token: alice.token })
ok('credit history readable by its owner (§6)', Array.isArray(led.json) && led.json.length === 1 && led.json[0].kind === 'signup_grant')

// Another user's ledger must NOT be readable.
let spy = await rest(`coin_ledger?select=kind&user_id=eq.${bob.id}`, { token: alice.token })
ok('cannot read someone else\'s credit history (RLS)', Array.isArray(spy.json) && spy.json.length === 0)

console.log('\n=== 2. ONBOARDING (§4: required fields only) ===')
for (const [u, h, g] of [[alice, 'alice' + stamp, 'female'], [bob, 'bob' + stamp, 'male']]) {
  const r = await rest(`profiles?id=eq.${u.id}`, {
    token: u.token, method: 'PATCH', prefer: 'return=representation',
    body: { handle: h, display_name: h, gender: g, dob: '1996-04-12',
            country_code: 'NG', country_name: 'Nigeria', region: 'Lagos', city: 'Ikeja',
            language: 'en', avatar_url: `https://example.test/${h}.jpg`,
            onboarded_at: new Date().toISOString() },
  })
  ok(`onboarding saves for ${g}`, r.status === 200 && r.json?.[0]?.onboarded_at, JSON.stringify(r.json).slice(0, 120))
}

console.log('\n=== 3. THE FEED (§5) ===')
let feed = await rpc('people_feed', { page_size: 20 }, alice.token)
const allMale = Array.isArray(feed.json) && feed.json.length > 0 && feed.json.every(p => p.gender === 'male')
const sawBob = allMale
const sawSelf = Array.isArray(feed.json) && feed.json.some(p => p.id === alice.id)
ok('woman sees only men (§1)', sawBob, `${feed.json?.length ?? 0} cards, all male`)
ok('feed excludes self', !sawSelf)
ok('feed row carries gallery_urls for tap-to-open', Array.isArray(feed.json) && 'gallery_urls' in (feed.json[0] || {}))

const first = feed.json?.[0]?.id
await rpc('advance_feed_position', { n: 3 }, alice.token)
let feed2 = await rpc('people_feed', { page_size: 20 }, alice.token)
ok('cursor advances — first profile changes after consuming (§5)', feed2.json?.[0]?.id !== first || (feed.json?.length ?? 0) <= 3)

console.log('\n=== 4. CREDITS + MESSAGING (§6) ===')
let conv = await rpc('start_dm', { other_user_id: bob.id }, alice.token)
let convId = typeof conv.json === 'string' ? conv.json : conv.json?.id
const matchGated = JSON.stringify(conv.json).includes('no mutual match')
ok('start_dm opens a conversation from the feed (§1)', !!convId,
   matchGated ? 'BLOCKED by the mutual-match gate - see report' : JSON.stringify(conv.json).slice(0,120))

if (!convId) {
  // Work around the match gate so the rest of the stack can be verified.
  const SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  const mk = await fetch(API + '/rest/v1/conversations', {method:'POST',
    headers:{apikey:SR,Authorization:'Bearer '+SR,'Content-Type':'application/json',Prefer:'return=representation'},body:'{}'})
  convId = (await mk.json())[0].id
  await fetch(API + '/rest/v1/conversation_members', {method:'POST',
    headers:{apikey:SR,Authorization:'Bearer '+SR,'Content-Type':'application/json'},
    body: JSON.stringify([{conversation_id:convId,user_id:alice.id},{conversation_id:convId,user_id:bob.id}])})
  console.log('        (conversation created directly so the rest can be tested)')
}

let c1 = await rpc('spend_daily_message_credit', {}, alice.token)
ok('first message of the day charges 100 → 900', c1.json?.[0]?.charged === true && c1.json?.[0]?.balance === 900, JSON.stringify(c1.json))

let c2 = await rpc('spend_daily_message_credit', {}, alice.token)
ok('second message same day charges nothing (§2)', c2.json?.[0]?.charged === false && c2.json?.[0]?.balance === 900)

let msg = await rest('messages', {
  token: alice.token, method: 'POST', prefer: 'return=representation',
  body: { conversation_id: convId, sender_id: alice.id, body: 'hello from the e2e check' },
})
ok('MESSAGE SENDS (the trigger bug)', msg.status === 201, JSON.stringify(msg.json).slice(0, 160))

console.log('\n=== 5. GAMES IN CHAT (§8) ===')
let game = await rpc('create_chat_game', { p_conversation: convId, p_kind: 'tic_tac_toe', p_state: { cells: Array(9).fill(null) } }, alice.token)
ok('game invite created', !!game.json?.id, JSON.stringify(game.json).slice(0, 160))

let acc = await rpc('respond_chat_game', { p_game: game.json?.id, p_accept: true }, bob.token)
ok('opponent accepts', acc.json?.status === 'active')

const cells = Array(9).fill(null); cells[4] = 'a'
let mv = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 0, p_summary: 'played the middle' }, alice.token)
ok('move applies and hands over the turn', mv.json?.move_count === 1 && mv.json?.turn_user_id === bob.id)

let stale = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 0 }, bob.token)
ok('stale move rejected (optimistic concurrency)', JSON.stringify(stale.json).includes('stale_move'), JSON.stringify(stale.json).slice(0, 100))

let wrongTurn = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 1 }, alice.token)
ok('cannot move out of turn', JSON.stringify(wrongTurn.json).includes('not your turn'))

console.log('\n=== 6. HIDDEN INFORMATION (§8 — the part that must not leak) ===')
let wg = await rpc('create_chat_game', { p_conversation: convId, p_kind: 'word_guess', p_state: { phase: 'setting', setter: 'a', mask: '', guessed: [], hits: {}, wrong: 0, solution: null } }, alice.token)
await rpc('respond_chat_game', { p_game: wg.json?.id, p_accept: true }, bob.token)
await rpc('set_game_secret', { p_game: wg.json?.id, p_secret: { word: 'BANANA' } }, alice.token)

let peek = await rest(`chat_game_secrets?select=secret&game_id=eq.${wg.json?.id}`, { token: bob.token })
ok('GUESSER CANNOT READ THE WORD (RLS)', Array.isArray(peek.json) && peek.json.length === 0, JSON.stringify(peek.json).slice(0, 120))

let own = await rest(`chat_game_secrets?select=secret&game_id=eq.${wg.json?.id}`, { token: alice.token })
ok('setter can read their own secret', own.json?.[0]?.secret?.word === 'BANANA')

console.log('\n=== 7. NOTIFICATIONS + ADS (§6, §7) ===')
await rpc('record_profile_view', { p_viewed: bob.id }, alice.token)
let notif = await rest(`notifications?select=type&user_id=eq.${bob.id}&order=created_at.desc`, { token: bob.token })
const types = (notif.json || []).map(n => n.type)
ok('profile_viewed notification delivered', types.includes('profile_viewed'), types.join(','))
ok('game_invite notification delivered', types.includes('game_invite'))
ok('game_round notification delivered', types.includes('game_round'))

let ads = await rest('app_settings?select=ads_enabled&id=eq.1', { token: alice.token })
ok('ad switch readable by every user (§7)', ads.json?.[0]?.ads_enabled === true)

console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`)
process.exit(fail ? 1 : 0)
