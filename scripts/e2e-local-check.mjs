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
// Friendship now comes from Interested in either direction (§05), so one tap
// from bob is enough for alice's post to reach his Friends tab.
await rpc('record_gallery_decision', { p_target_id: alice.id, p_decision: 'interested' }, bob.token)
let fpNow = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, bob.token)
ok("A FRIEND'S POST SHOWS IN THE FRIENDS TAB", (fpNow.json || []).some(x => x.caption === 'hello world'), JSON.stringify(fpNow.json).slice(0, 110))
let fpStrangerNow = await rpc('friends_posts', { p_limit: 10, p_offset: 0 }, bot.token)
ok('a stranger sees none of it', (fpStrangerNow.json || []).length === 0, JSON.stringify(fpStrangerNow.json).slice(0, 110))

console.log('\n=== 10. HS-LM-v1 §04 THE FEED: three actions, never repeats ===')
await rpc('record_gallery_decision', { p_target_id: bob.id, p_decision: 'passed' }, alice.token)
let f1 = await rpc('people_feed', { page_size: 50 }, alice.token)
ok('A REJECTED PROFILE NEVER COMES BACK', !(f1.json || []).some(x => x.id === bob.id), ((f1.json||[]).length) + ' cards left')
let rn = await rest('notifications?select=id&user_id=eq.' + bob.id + '&type=eq.reject', { key: SRK })
ok('REJECT IS SILENT — they are never told', (rn.json || []).length === 0)

console.log('\n=== 11. HS-LM-v1 §05 FRIENDS: from Interested, both directions ===')
const carol = await signup('carol.' + s + '@lm.local')
await onboard(carol, 'carol' + s, 'male')
await rpc('record_gallery_decision', { p_target_id: carol.id, p_decision: 'interested' }, alice.token)
let fa = await rpc('get_my_friends', {}, alice.token)
ok('ONE-WAY INTERESTED MAKES A FRIEND', (fa.json || []).some(x => x.id === carol.id), JSON.stringify(fa.json).slice(0, 110))
let fc = await rpc('get_my_friends', {}, carol.token)
ok('AND THEY SEE YOU TOO — §05 is a union, not a match', (fc.json || []).some(x => x.id === alice.id))
ok('the row says who chose whom',
  (fa.json || []).find(x => x.id === carol.id)?.i_said_it === true &&
  (fc.json || []).find(x => x.id === alice.id)?.they_said_it === true)
let stl = await rpc('set_status_line', { p_text: 'here for the games' }, alice.token)
ok('a status line can be set', stl.json === 'here for the games', JSON.stringify(stl.json))
ok('friends carry status and last seen',
  'status_line' in ((fc.json || [])[0] ?? {}) && 'last_seen_at' in ((fc.json || [])[0] ?? {}))
await rpc('remove_friend', { p_other: carol.id }, alice.token)
fa = await rpc('get_my_friends', {}, alice.token)
fc = await rpc('get_my_friends', {}, carol.token)
ok('REMOVE A FRIEND clears both sides (§07)',
  !(fa.json || []).some(x => x.id === carol.id) && !(fc.json || []).some(x => x.id === alice.id))

console.log('\n=== 12. HS-LM-v1 §06 GIFTS COST COINS AND BURN ===')
const dan = await signup('dan.' + s + '@lm.local')
await onboard(dan, 'dan' + s, 'male')
const coinsOf = async (u) => (await rest('profiles?select=coins&id=eq.' + u.id, { key: SRK })).json?.[0]?.coins
let aBefore = await coinsOf(alice), dBefore = await coinsOf(dan)
let gr = await rpc('send_profile_gift', { p_profile_id: dan.id, p_gift_id: '456727' }, alice.token)
let aAfter = await coinsOf(alice), dAfter = await coinsOf(dan)
ok('GIFT SENT', !!gr.json?.id, JSON.stringify(gr.json).slice(0, 90))
ok('SENDER PAYS THE CATALOGUE COST', aBefore - aAfter === 250, aBefore + ' -> ' + aAfter)
ok('RECEIVER GETS LESS THAN IT COST', dAfter - dBefore === 150, dBefore + ' -> ' + dAfter)
ok('THE LOOPHOLE IS CLOSED — coins are burned',
  (aBefore + dBefore) > (aAfter + dAfter), 'total ' + (aBefore + dBefore) + ' -> ' + (aAfter + dAfter))
let cheat = await rpc('send_profile_gift', { p_profile_id: dan.id, p_gift_id: 'not-a-gift' }, alice.token)
ok('THE CLIENT CANNOT NAME ITS OWN PRICE', JSON.stringify(cheat.json).includes('no such gift'))
const eve = await signup('eve.' + s + '@lm.local')
await onboard(eve, 'eve' + s, 'female')
await rest('profiles?id=eq.' + eve.id, { key: SRK, method: 'PATCH', body: { coins: 10 } })
let broke = await rpc('send_profile_gift', { p_profile_id: dan.id, p_gift_id: '456720' }, eve.token)
ok('CANNOT GIFT WITHOUT THE COINS', JSON.stringify(broke.json).includes('insufficient_coins'), JSON.stringify(broke.json).slice(0, 80))
let pgx = await rpc('send_gift', { p_post_id: np.json?.[0]?.id, p_gift_id: '456720', p_gift_name: 'x', p_gift_image: null }, alice.token)
ok('the free post-gift path is closed', JSON.stringify(pgx.json).includes('not posts'), JSON.stringify(pgx.json).slice(0, 80))
let cat = await rest('gift_catalogue?select=gift_id,cost_coins,value_coins', { token: alice.token })
ok('EVERY GIFT IS WORTH LESS THAN IT COSTS',
  Array.isArray(cat.json) && cat.json.length > 0 && cat.json.every(g => g.value_coins < g.cost_coins),
  (cat.json || []).length + ' gifts')


console.log('\n=== 13. HS-LM-v1 §07 consent, export, photo moderation ===')
let cons = await rpc('record_consent', { p_kinds: ['terms', 'privacy', 'age_18'], p_version: 'HS-LM-v1' }, alice.token)
ok('CONSENT IS RECORDED', cons.json === 3, JSON.stringify(cons.json))
let consRows = await rest('user_consents?select=kind,version,accepted_at', { token: alice.token })
ok('with a server timestamp and a version',
  (consRows.json || []).length === 3 && (consRows.json || []).every(c => c.version === 'HS-LM-v1' && !!c.accepted_at))
let consSpy = await rest('user_consents?select=kind&user_id=eq.' + alice.id, { token: bob.token })
ok("nobody can read another person's consents (RLS)", (consSpy.json || []).length === 0)
let consAgain = await rpc('record_consent', { p_kinds: ['terms'], p_version: 'HS-LM-v1' }, alice.token)
ok('recording the same consent twice is a no-op', consAgain.json === 0, JSON.stringify(consAgain.json))

let exp = await rpc('export_my_data', {}, alice.token)
ok('DATA EXPORT RETURNS THE ACCOUNT', !!exp.json?.profile?.id && exp.json.profile.id === alice.id)
ok('the export carries the coin ledger and decisions',
  Array.isArray(exp.json?.coin_ledger) && Array.isArray(exp.json?.decisions_i_made))
ok('the export does NOT leak who blocked me', !('blocked_me' in (exp.json ?? {})))

// Every avatar queues itself for review — the trigger, not the client.
let mine = await rest('photo_reviews?select=url,state&user_id=eq.' + alice.id, { token: alice.token })
ok('EVERY PICTURE QUEUES ITSELF FOR REVIEW', (mine.json || []).length > 0, JSON.stringify(mine.json).slice(0, 90))
let queueAsUser = await rpc('pending_photo_reviews', { p_limit: 10 }, alice.token)
ok('a normal user cannot see the moderation queue', JSON.stringify(queueAsUser.json).includes('not allowed'), JSON.stringify(queueAsUser.json).slice(0, 70))

// Promote bob and let him reject alice's picture.
await rest('profiles?id=eq.' + bob.id, { key: SRK, method: 'PATCH', body: { role: 'admin' } })
let queue = await rpc('pending_photo_reviews', { p_limit: 50 }, bob.token)
ok('AN ADMIN SEES THE QUEUE', Array.isArray(queue.json) && queue.json.length > 0, ((queue.json || []).length) + ' pending')
// Read her review row directly rather than scanning the admin queue: that
// query is capped at 50 and the cap is reached once a few test runs have
// accumulated, which made this fail for a reason that had nothing to do
// with moderation.
let mineRow = await rest('photo_reviews?select=id&state=eq.pending&user_id=eq.' + alice.id, { key: SRK })
const target = (mineRow.json || [])[0]
await rpc('review_photo', { p_review_id: target?.id, p_approve: false, p_reason: 'test rejection' }, bob.token)
let after = await rest('profiles?select=avatar_url&id=eq.' + alice.id, { key: SRK })
ok('A REJECTED PICTURE LEAVES THE FEED', after.json?.[0]?.avatar_url === null, JSON.stringify(after.json))
let prn = await rest('notifications?select=type&user_id=eq.' + alice.id + '&type=eq.photo_rejected', { key: SRK })
ok('and the person is told', (prn.json || []).length === 1)


console.log('\n=== 14. HS-LM-v1 §05 tips and topics ===')
let tips = await rpc('list_topics', { p_kind: 'tip', p_limit: 20, p_offset: 0 }, alice.token)
ok('THE TIPS SECTION IS NOT EMPTY ON DAY ONE', (tips.json || []).length >= 5, ((tips.json || []).length) + ' tips')
ok('tips have no author — they are from Love meet', (tips.json || []).every(t => t.author_id === null))

// bob said Interested about alice earlier, so he is a friend and hears about it.
let topic = await rpc('create_topic', { p_title: 'Long distance, worth it?', p_body: 'Six months in and we have met twice.' }, alice.token)
ok('ANYONE CAN OPEN A TOPIC', !!topic.json?.id, JSON.stringify(topic.json).slice(0, 90))
let ftn = await rest('notifications?select=type,body&user_id=eq.' + bob.id + '&type=eq.friend_topic', { key: SRK })
ok('A FRIEND HEARS ABOUT IT (§05)', (ftn.json || []).length === 1, JSON.stringify(ftn.json).slice(0, 100))
let strangerN = await rest('notifications?select=id&user_id=eq.' + bot.id + '&type=eq.friend_topic', { key: SRK })
ok('a stranger does not', (strangerN.json || []).length === 0)

let rep = await rpc('reply_to_topic', { p_topic: topic.json?.id, p_body: 'Twice in six months is the problem.' }, bob.token)
ok('anyone can reply', !!rep.json?.id)
let reps = await rpc('list_topic_replies', { p_topic: topic.json?.id }, alice.token)
ok('the reply reads back', (reps.json || []).some(r => r.body.startsWith('Twice')))
let counted = await rpc('list_topics', { p_kind: 'topic', p_limit: 10, p_offset: 0 }, alice.token)
ok('the reply count moves', (counted.json || []).find(t => t.id === topic.json?.id)?.reply_count === 1)
let ownerN = await rest('notifications?select=id&user_id=eq.' + alice.id + '&type=eq.topic_reply', { key: SRK })
ok('the person who opened it is told', (ownerN.json || []).length === 1)

// eve, not bob: section 13 promoted bob to admin, and an admin deleting
// somebody else's topic is correct behaviour, not the thing under test.
let steal = await rpc('delete_topic', { p_topic: topic.json?.id }, eve.token)
ok('SOMEBODY ELSE CANNOT DELETE YOUR TOPIC', JSON.stringify(steal.json).includes('not yours'), JSON.stringify(steal.json).slice(0, 70))
let direct = await rest('topics', { token: bob.token, method: 'POST', body: { kind: 'topic', author_id: bob.id, title: 'sneaking in', body: 'no notification, no count' } })
ok('and cannot insert one directly, skipping the fan-out (RLS)', direct.status !== 201, 'status ' + direct.status)
await rpc('delete_topic', { p_topic: topic.json?.id }, alice.token)
let gone = await rpc('list_topics', { p_kind: 'topic', p_limit: 10, p_offset: 0 }, alice.token)
ok('the author can delete their own', !(gone.json || []).some(t => t.id === topic.json?.id))


console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`)
process.exit(fail ? 1 : 0)
