// Edge Function: bot personas (same `is_bot` roster as feed-bot / game-bot)
// reply in DM conversations a real user starts with them. No new client
// code needed — a user reaches a bot exactly the way they'd reach any other
// user: view their profile (e.g. from a feed post/comment), tap Message,
// which calls the existing `start_dm` RPC.
//
// Fire this with a Supabase DATABASE WEBHOOK on `public.messages` (INSERT)
// → HTTP Request → this function (same pattern as notify-email — see
// SETUP.md). Add header `x-webhook-secret: <secret>` matching
// CHAT_BOT_SECRET below.
//
// Content/behavior policy: the bot stays in character and never proactively
// announces it's automated (matches the Day 2 "no disclosure" product
// decision), but it does not lie if asked directly and sincerely whether
// it's a bot/AI — active deception under direct questioning is a firmer
// line than passive non-disclosure. Flag to product if this should change.
//
// Deploy:  npx supabase functions deploy chat-bot --project-ref <ref>
// Secrets: npx supabase secrets set CHAT_BOT_SECRET=<any long random string>
//          npx supabase secrets set BOT_ACCOUNT_PASSWORD=<same value used by game-bot>
//          npx supabase secrets set ANTHROPIC_API_KEY=<your Anthropic API key>
//          SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  created_at: string
  deleted_at: string | null
}

const HISTORY_LIMIT = 20
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000
const TYPING_DELAY_MIN_MS = 1500
const TYPING_DELAY_MAX_MS = 4000
const CLAUDE_MODEL = 'claude-sonnet-5'

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Fail CLOSED: an unset secret must disable the function, not leave the
    // endpoint open — an open chat-bot means unbounded Anthropic API spend
    // on forged webhook payloads.
    const secret = Deno.env.get('CHAT_BOT_SECRET')
    if (!secret) return json({ error: 'function not configured (CHAT_BOT_SECRET unset)' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const botPassword = Deno.env.get('BOT_ACCOUNT_PASSWORD')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!supaUrl || !svcKey || !anonKey || !botPassword || !anthropicKey) {
      return json({ error: 'function not configured' }, 500)
    }

    let payload: { record?: MessageRow }
    try { payload = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    const msg = payload.record
    if (!msg || !msg.body || msg.deleted_at) return json({ ok: true, ignored: 'no body' })
    if (Date.now() - Date.parse(msg.created_at) > MAX_MESSAGE_AGE_MS) {
      return json({ ok: true, ignored: 'stale webhook delivery' })
    }

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: members } = await admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', msg.conversation_id)
    if (!members || members.length === 0) return json({ ok: true, ignored: 'no members' })

    const memberIds: string[] = members.map((m: { user_id: string }) => m.user_id)
    const { data: botProfiles } = await admin
      .from('profiles')
      .select('id, display_name, bio, interests, gender')
      .in('id', memberIds)
      .eq('is_bot', true)
      .eq('bot_kind', 'persona')
    const bot = (botProfiles ?? [])[0]
    if (!bot) return json({ ok: true, ignored: 'no bot in this conversation' })
    if (msg.sender_id === bot.id) return json({ ok: true, ignored: 'message was from the bot itself' })

    // Idempotency: if the bot already replied after this message, don't reply twice
    // (duplicate/retried webhook delivery).
    const { data: latest } = await admin
      .from('messages')
      .select('sender_id, created_at')
      .eq('conversation_id', msg.conversation_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latest && latest.sender_id === bot.id && Date.parse(latest.created_at) >= Date.parse(msg.created_at)) {
      return json({ ok: true, ignored: 'already replied' })
    }

    const { data: history } = await admin
      .from('messages')
      .select('sender_id, body, created_at')
      .eq('conversation_id', msg.conversation_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    const chronological = (history ?? []).slice().reverse()

    const anthropicMessages = chronological
      .filter((m: { body: string | null }) => !!m.body)
      .map((m: { sender_id: string; body: string }) => ({
        role: m.sender_id === bot.id ? 'assistant' : 'user',
        content: m.body,
      }))
    while (anthropicMessages.length && anthropicMessages[0].role !== 'user') anthropicMessages.shift()
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: 'user', content: msg.body })
    }

    const replyText = await generateReply(anthropicKey, bot, anthropicMessages)
    if (!replyText) return json({ ok: true, skipped: 'no reply generated (refusal or empty)' })

    const client = createClient(supaUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: signInErr } = await client.auth.signInWithPassword({
      email: `${await handleFor(admin, bot.id)}@lovemeet.bot.invalid`,
      password: botPassword,
    })
    if (signInErr) return json({ ok: false, error: `bot sign-in failed: ${signInErr.message}` })

    await broadcastTyping(client, msg.conversation_id, bot.id, true)
    const delay = TYPING_DELAY_MIN_MS + Math.random() * (TYPING_DELAY_MAX_MS - TYPING_DELAY_MIN_MS)
    await sleep(delay)

    const { error: insertErr } = await client
      .from('messages')
      .insert({ conversation_id: msg.conversation_id, sender_id: bot.id, body: replyText })
    await broadcastTyping(client, msg.conversation_id, bot.id, false)

    if (insertErr) return json({ ok: false, error: `send failed: ${insertErr.message}` })
    return json({ ok: true, sent: true })
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 200)
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFor(admin: any, botId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('handle').eq('id', botId).maybeSingle()
  return data?.handle ?? ''
}

type BotPersona = { id: string; display_name: string; bio: string | null; interests: string[] | null }

async function generateReply(
  apiKey: string,
  bot: BotPersona,
  messages: { role: string; content: string }[],
): Promise<string | null> {
  const interests = (bot.interests ?? []).join(', ')
  const system = [
    `You are ${bot.display_name}, a real person using Love meet, a dating app. `,
    bot.bio ? `Your bio: "${bot.bio}". ` : '',
    interests ? `Your interests: ${interests}. ` : '',
    `You're texting 1:1 with someone you matched with. Reply the way a real person actually ` +
    `texts on a dating app: warm, casual, a little playful, contractions are fine, the ` +
    `occasional emoji but not every message. Keep replies SHORT — 1 to 3 sentences, never a ` +
    `wall of text. Ask a follow-up question sometimes to keep the conversation going, but not ` +
    `every single message. Stay in character as ${bot.display_name} and don't bring up that ` +
    `you're an AI or automated — but if someone asks directly and sincerely whether you're a ` +
    `bot, don't lie about it. Never discuss payments, gifts, or anything transactional unless ` +
    `they bring it up first.`,
  ].join('')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system,
      messages,
    }),
  })
  if (!res.ok) {
    // Log the real failure — otherwise a revoked/exhausted API key is
    // indistinguishable from the model politely declining to reply.
    console.error(`anthropic api error ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return null
  }
  const data = await res.json()
  if (data.stop_reason === 'refusal') return null
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text')
  const text = textBlock?.text?.trim()
  return text || null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function broadcastTyping(client: any, conversationId: string, botId: string, active: boolean) {
  const channel = client.channel('typing-bus', { config: { broadcast: { self: false } } })
  await channel.subscribe()
  await channel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { from: botId, conversation_id: conversationId, active },
  })
  await client.removeChannel(channel)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
