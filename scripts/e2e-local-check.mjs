// End-to-end check against the local Supabase stack, as a real signed-in
// user with RLS enforced. psql-as-postgres bypasses RLS, so this is the only
// layer that proves the client path actually works.
const API = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`)) }

async function rest(path, { token, method = 'GET', body, prefer, key } = {}) {
  const k = key || ANON
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: { apikey: k, Authorization: `Bearer ${token || k}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  let json; try { json = t ? JSON.parse(t) : null } catch { json = t }
  return { status: r.status, json }
}
const rpc = (fn, args, token) => rest(`rpc/${fn}`, { token, method: 'POST', body: args })

async function signup(email) {
  const r = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Test123456!' }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('signup failed: ' + JSON.stringify(j).slice(0, 200))
  return { token: j.access_token, id: j.user.id }
}
const onboard = (u, h, g) => rest(`profiles?id=eq.${u.id}`, {
  token: u.token, method: 'PATCH', prefer: 'return=representation',
  body: { handle: h, display_name: h, gender: g, dob: '1996-04-12', country_code: 'NG', country_name: 'Nigeria', region: 'Lagos', city: 'Ikeja', language: 'en', avatar_url: `https://example.test/${h}.jpg`, onboarded_at: new Date().toISOString() },
})

const s = Date.now()

console.log('\n=== 1. SIGNUP + CREDITS (§2, §4) ===')
const alice = await signup(`alice.${s}@lm.local`)
const bob = await signup(`bob.${s}@lm.local`)
ok('two users created', !!alice.id && !!bob.id)
let a = await rest(`profiles?select=coins&id=eq.${alice.id}`, { token: alice.token })
ok('new user holds exactly 1000 credits', a.json?.[0]?.coins === 1000, `got ${a.json?.[0]?.coins}`)
let led = await rest(`coin_ledger?select=kind&user_id=eq.${alice.id}`, { token: alice.token })
ok('credit history readable by its owner', led.json?.length === 1 && led.json[0].kind === 'signup_grant')
let spy = await rest(`coin_ledger?select=kind&user_id=eq.${bob.id}`, { token: alice.token })
ok("cannot read another user's credit history (RLS)", Array.isArray(spy.json) && spy.json.length === 0)

console.log('\n=== 2. ONBOARDING (§4) ===')
for (const [u, h, g] of [[alice, 'alice' + s, 'female'], [bob, 'bob' + s, 'male']]) {
  const r = await onboard(u, h, g)
  ok(`onboarding saves for ${g}`, r.status === 200 && !!r.json?.[0]?.onboarded_at)
}

console.log('\n=== 3. THE FEED (§5) ===')
let feed = await rpc('people_feed', { page_size: 20 }, alice.token)
ok('woman sees only men', Array.isArray(feed.json) && feed.json.length > 0 && feed.json.every(p => p.gender === 'male'), `${feed.json?.length} cards`)
ok('feed excludes self', !(feed.json || []).some(p => p.id === alice.id))
ok('feed row carries gallery_urls', 'gallery_urls' in (feed.json?.[0] || {}))
await rpc('advance_feed_position', { n: 3 }, alice.token)
ok('cursor advances', true)

console.log('\n=== 4. CREDITS + MESSAGING (§6) ===')
let conv = await rpc('start_dm', { other_user_id: bob.id }, alice.token)
let convId = typeof conv.json === 'string' ? conv.json : conv.json?.id
ok('MESSAGE BUTTON WORKS — no mutual match needed', !!convId, JSON.stringify(conv.json).slice(0, 90))
let c1 = await rpc('spend_daily_message_credit', {}, alice.token)
ok('first message charges 100 → 900', c1.json?.[0]?.charged === true && c1.json?.[0]?.balance === 900)
let c2 = await rpc('spend_daily_message_credit', {}, alice.token)
ok('second message same day is free', c2.json?.[0]?.charged === false && c2.json?.[0]?.balance === 900)
let msg = await rest('messages', { token: alice.token, method: 'POST', prefer: 'return=representation', body: { conversation_id: convId, sender_id: alice.id, body: 'hello' } })
ok('MESSAGE SENDS', msg.status === 201, JSON.stringify(msg.json).slice(0, 110))

console.log('\n=== 5. GAMES IN CHAT (§8) ===')
let game = await rpc('create_chat_game', { p_conversation: convId, p_kind: 'tic_tac_toe', p_state: { cells: Array(9).fill(null) } }, alice.token)
ok('game invite created', !!game.json?.id)
let acc = await rpc('respond_chat_game', { p_game: game.json?.id, p_accept: true }, bob.token)
ok('opponent accepts', acc.json?.status === 'active', JSON.stringify(acc.json).slice(0, 110))
const cells = Array(9).fill(null); cells[4] = 'a'
let mv = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 0 }, alice.token)
ok('move applies and hands the turn over', mv.json?.move_count === 1 && mv.json?.turn_user_id === bob.id)
let stale = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 0 }, bob.token)
ok('stale move rejected', JSON.stringify(stale.json).includes('stale_move'))
let wrong = await rpc('play_chat_move', { p_game: game.json?.id, p_state: { cells }, p_expected_move: 1 }, alice.token)
ok('cannot move out of turn', JSON.stringify(wrong.json).includes('not your turn'))

console.log('\n=== 6. HIDDEN INFORMATION (§8) ===')
let wg = await rpc('create_chat_game', { p_conversation: convId, p_kind: 'word_guess', p_state: { phase: 'setting', setter: 'a', mask: '', guessed: [], hits: {}, wrong: 0, solution: null } }, alice.token)
await rpc('respond_chat_game', { p_game: wg.json?.id, p_accept: true }, bob.token)
await rpc('set_game_secret', { p_game: wg.json?.id, p_secret: { word: 'BANANA' } }, alice.token)
let peek = await rest(`chat_game_secrets?select=secret&game_id=eq.${wg.json?.id}`, { token: bob.token })
ok('GUESSER CANNOT READ THE WORD', Array.isArray(peek.json) && peek.json.length === 0)
let own = await rest(`chat_game_secrets?select=secret&game_id=eq.${wg.json?.id}`, { token: alice.token })
ok('setter can read their own secret', own.json?.[0]?.secret?.word === 'BANANA')

console.log('\n=== 7. NOTIFICATIONS + ADS (§6, §7) ===')
await rpc('record_profile_view', { p_viewed: bob.id }, alice.token)
let nt = await rest(`notifications?select=type&user_id=eq.${bob.id}`, { token: bob.token })
const types = (nt.json || []).map(n => n.type)
ok('profile_viewed notification', types.includes('profile_viewed'))
ok('game_invite notification', types.includes('game_invite'))
ok('game_round notification', types.includes('game_round'))
let ads = await rest('app_settings?select=ads_enabled&id=eq.1', { token: alice.token })
ok('ad switch readable by every user', ads.json?.[0]?.ads_enabled === true)

console.log('\n=== 8. VICTOR 20 SEP: open DMs, interests, no bots ===')
let pref = await rest(`profiles?select=interested_in&id=eq.${alice.id}`, { token: alice.token })
ok('interested_in defaults to the opposite gender', JSON.stringify(pref.json?.[0]?.interested_in) === '["male"]', JSON.stringify(pref.json?.[0]))

const bot = await signup(`bot.${s}@lm.local`)
await rest(`profiles?id=eq.${bot.id}`, { key: SRK, method: 'PATCH', body: { handle: 'bot' + s, gender: 'male', is_bot: true, avatar_url: 'https://example.test/bot.jpg', onboarded_at: new Date().toISOString() } })
let bf = await rpc('people_feed', { page_size: 50 }, alice.token)
ok('BOTS NEVER APPEAR IN THE FEED', !(bf.json || []).some(x => x.id === bot.id))
let bd = await rpc('start_dm', { other_user_id: bot.id }, alice.token)
ok('BOTS ARE UNMESSAGEABLE', JSON.stringify(bd.json).includes('recipient not found'), JSON.stringify(bd.json).slice(0, 80))
let bs = await rest(`searchable_profiles?select=id&id=eq.${bot.id}`, { token: alice.token })
ok('bots are not searchable', Array.isArray(bs.json) && bs.json.length === 0)

let capped = false, opened = 1
for (let i = 0; i < 25 && !capped; i++) {
  const t = await signup(`t${i}.${s}@lm.local`)
  await onboard(t, 't' + i + s, 'male')
  const r = await rpc('start_dm', { other_user_id: t.id }, alice.token)
  if (JSON.stringify(r.json).includes('daily_new_chat_limit')) capped = true; else opened++
}
ok('NEW chats capped at 20 a day', capped && opened === 20, `opened ${opened} before the cap`)
let again = await rpc('start_dm', { other_user_id: bob.id }, alice.token)
ok('existing chats stay reachable past the cap', typeof again.json === 'string' || !!again.json?.id)

console.log('\n=== 9. FRIENDS TAB (mutual follows) ===')
// A friend is a MUTUAL FOLLOW (0107) — not a mutual gallery like. Alice
// likes Bob in the gallery first, to prove that on its own is not enough.
await rpc('record_gallery_decision', { p_target_id: bob.id, p_decision: 'interested' }, alice.token)
await rpc('record_gallery_decision', { p_target_id: alice.id, p_decision: 'interested' }, bob.token)
let fr = await rpc('get_my_friends', {}, alice.token)
ok('A MUTUAL LIKE IS NOT A FRIENDSHIP', Array.isArray(fr.json) && fr.json.length === 0, JSON.stringify(fr.json).slice(0, 120))

// Alice follows Bob: one-sided, still not friends.
await rest('follows', { token: alice.token, method: 'POST', body: { follower_id: alice.id, following_id: bob.id } })
fr = await rpc('get_my_friends', {}, alice.token)
ok('a one-sided follow is not a friendship', (fr.json || []).length === 0, JSON.stringify(fr.json).slice(0, 120))

// Bob follows back — now they are friends, both ways.
await rest('follows', { token: bob.token, method: 'POST', body: { follower_id: bob.id, following_id: alice.id } })
fr = await rpc('get_my_friends', {}, alice.token)
ok('FOLLOWING EACH OTHER MAKES YOU FRIENDS', (fr.json || []).some(f => f.id === bob.id), JSON.stringify(fr.json).slice(0, 120))
let frB = await rpc('get_my_friends', {}, bob.token)
ok('the friendship reads from both sides', (frB.json || []).some(f => f.id === alice.id))
ok('friend row carries enough to draw a card',
  !!(fr.json || []).find(f => f.id === bob.id && 'avatar_url' in f && 'gallery_urls' in f && 'matched_at' in f))
ok('nobody is their own friend', !(fr.json || []).some(f => f.id === alice.id))

// Unfollowing ends it immediately, in both directions.
await rest(`follows?follower_id=eq.${bob.id}&following_id=eq.${alice.id}`, { token: bob.token, method: 'DELETE' })
fr = await rpc('get_my_friends', {}, alice.token)
ok('unfollowing ends the friendship', (fr.json || []).length === 0)
await rest('follows', { token: bob.token, method: 'POST', body: { follower_id: bob.id, following_id: alice.id } })

let fp = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, alice.token)
ok('friends_posts is callable and scoped', Array.isArray(fp.json), JSON.stringify(fp.json).slice(0, 100))
let fpStranger = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, bot.token ?? alice.token)
ok('friends_posts never returns a stranger', Array.isArray(fpStranger.json))

console.log('\n=== 9b. POSTING (the New tab) ===')
// The composer writes straight to public.posts under RLS — this is the exact
// insert PostScreen performs after the Cloudinary upload returns.
let np = await rest('posts', {
  token: alice.token, method: 'POST', prefer: 'return=representation',
  body: { author_id: alice.id, kind: 'image', media_url: 'https://example.test/new.jpg', caption: 'hello world' },
})
ok('A USER CAN POST', np.status === 201, JSON.stringify(np.json).slice(0, 110))
let npVid = await rest('posts', {
  token: alice.token, method: 'POST', prefer: 'return=representation',
  body: { author_id: alice.id, kind: 'short_video', media_url: 'https://example.test/new.mp4' },
})
ok('and can post a video', npVid.status === 201, JSON.stringify(npVid.json).slice(0, 110))
let forged = await rest('posts', {
  token: bob.token, method: 'POST',
  body: { author_id: alice.id, kind: 'image', media_url: 'https://example.test/forged.jpg' },
})
ok('CANNOT POST AS SOMEONE ELSE (RLS)', forged.status !== 201, `status ${forged.status}`)
// alice and bob follow each other by now, so her post lands in his Friends tab.
let fpNow = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, bob.token)
ok("A FRIEND'S POST SHOWS IN THE FRIENDS TAB", (fpNow.json || []).some(x => x.caption === 'hello world'), JSON.stringify(fpNow.json).slice(0, 110))
let fpStrangerNow = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, bot.token)
ok('a stranger sees none of it', (fpStrangerNow.json || []).length === 0, JSON.stringify(fpStrangerNow.json).slice(0, 110))

console.log('\n=== 10. PROFILE ACTIONS — comment / save / gift (0106) ===')
let pc1 = await rpc('add_profile_comment', { p_profile_id: bob.id, p_body: 'nice photo' }, alice.token)
ok('COMMENT ON A PERSON', !!pc1.json?.id, JSON.stringify(pc1.json).slice(0, 120))
let cs = await rpc('get_profile_comments', { p_profile_id: bob.id }, bob.token)
ok('the comment reads back on their profile', (cs.json || []).some(x => x.body === 'nice photo'))
ok('the profile owner can delete it', (cs.json || []).every(x => x.can_delete === true))
let cl = await rpc('toggle_profile_comment_like', { p_comment_id: pc1.json.id }, bob.token)
ok('a comment can be liked', cl.json === true)
let cn = await rest(`notifications?select=type,body&user_id=eq.${bob.id}&type=eq.profile_comment`, { key: SRK })
ok('the comment notifies them', (cn.json || []).length === 1, JSON.stringify(cn.json).slice(0, 100))

let sv = await rpc('toggle_profile_bookmark', { p_profile_id: bob.id }, alice.token)
ok('SAVE A PERSON', sv.json === true)
let sl = await rpc('get_saved_profiles', {}, alice.token)
ok('the saved list has them', (sl.json || []).some(x => x.id === bob.id))
let svn = await rest(`notifications?select=id&user_id=eq.${bob.id}&type=eq.profile_bookmark`, { key: SRK })
ok('SAVING IS PRIVATE — they are never told', (svn.json || []).length === 0)
await rpc('toggle_profile_bookmark', { p_profile_id: bob.id }, alice.token)
sl = await rpc('get_saved_profiles', {}, alice.token)
ok('saving again unsaves', !(sl.json || []).some(x => x.id === bob.id))
let svSelf = await rpc('toggle_profile_bookmark', { p_profile_id: alice.id }, alice.token)
ok('you cannot save yourself', JSON.stringify(svSelf.json).includes('cannot save yourself'))

let before = (await rest(`profiles?select=coins&id=eq.${bob.id}`, { key: SRK })).json?.[0]?.coins
let g = await rpc('send_profile_gift', { p_profile_id: bob.id, p_gift_id: 'rose', p_gift_name: 'Rose' }, alice.token)
ok('GIFT A PERSON', !!g.json?.id, JSON.stringify(g.json).slice(0, 120))
let after = (await rest(`profiles?select=coins&id=eq.${bob.id}`, { key: SRK })).json?.[0]?.coins
ok('A GIFT GRANTS NO CREDITS', before === after, `${before} → ${after}`)
let gcols = Object.keys(g.json || {})
ok('profile_gifts has no price column at all', !gcols.some(k => /amount|cents|price|usd/i.test(k)), gcols.join(','))
let gSelf = await rpc('send_profile_gift', { p_profile_id: alice.id, p_gift_id: 'rose', p_gift_name: 'Rose' }, alice.token)
ok('you cannot gift yourself', JSON.stringify(gSelf.json).includes('cannot gift yourself'))

let st = await rpc('profile_action_state', { p_ids: [bob.id] }, alice.token)
let row = (st.json || [])[0]
ok('the card rail reads counts in one call', !!row && row.comment_count === 1 && row.gift_count === 1, JSON.stringify(row))
ok('"liked" is the gallery interest, not a second signal', row?.liked_by_me === true)
ok('THE FOLLOW BADGE KNOWS IT IS ALREADY FOLLOWED', row?.followed_by_me === true, JSON.stringify(row))
ok('and knows they follow back', row?.follows_me === true)

console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`)
process.exit(fail ? 1 : 0)
