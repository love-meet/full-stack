// Edge Function: email a user when an in-app notification is created.
//
// Fire it with a Supabase DATABASE WEBHOOK on `public.notifications` (INSERT)
// → HTTP Request → this function. Add a header `x-webhook-secret: <secret>`
// matching the NOTIFY_EMAIL_SECRET below.
//
// It looks up the recipient's email + email_notifications preference, renders
// a branded template for the notification type, and sends it over Gmail SMTP
// using your app password (denomailer, dynamically imported).
//
// Deploy:  npx supabase functions deploy notify-email --no-verify-jwt --project-ref <ref>
// Secrets (npx supabase secrets set ...):
//   SMTP_HOST=smtp.gmail.com   SMTP_PORT=465
//   SMTP_USER=you@gmail.com    SMTP_PASS=<gmail app password, 16 chars, no spaces>
//   SMTP_FROM="Love meet <you@gmail.com>"
//   NOTIFY_EMAIL_SECRET=<any long random string, also set on the webhook>
//   APP_URL=https://your-app-url        (for links in the email)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (provided by the platform)

// @ts-expect-error — Deno-resolved at runtime in Supabase Edge Functions.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error — Deno-resolved at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: { env: { get(k: string): string | undefined } }

type Notification = {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  post_id: string | null
  conversation_id: string | null
  gift_id: string | null
  body: string | null
}

serve(async (req: Request) => {
  // Everything is wrapped so the function ALWAYS returns a JSON response —
  // never an opaque 502 — making real errors visible in the response/logs.
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    const secret = Deno.env.get('NOTIFY_EMAIL_SECRET')
    if (secret && req.headers.get('x-webhook-secret') !== secret) {
      return json({ error: 'bad secret' }, 401)
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supaUrl || !svcKey) return json({ error: 'function not configured' }, 500)

    let payload: { record?: Notification; type?: string }
    try { payload = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    const n = payload.record
    if (!n || !n.user_id) return json({ ok: true, ignored: 'no record' })

    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Recipient channels + name.
    const { data: profile } = await admin
      .from('profiles')
      .select('email_notifications, telegram_notifications, telegram_user_id, display_name, first_name, last_seen_at')
      .eq('id', n.user_id)
      .maybeSingle()
    const emailOn = profile?.email_notifications !== false
    const tgOn = profile?.telegram_notifications === true
    const tgChatId = profile?.telegram_user_id ?? null

    // "Online" = heartbeat within the last 60s. Used to decide whether a chat
    // message should also be emailed (offline) or not (online → sound only).
    const lastSeen = profile?.last_seen_at ? Date.parse(profile.last_seen_at) : 0
    const isOnline = lastSeen > 0 && (Date.now() - lastSeen) < 60_000

    // Recipient email lives on the auth user. Telegram sign-ups have a
    // SYNTHETIC placeholder address (tg_<id>@telegram.lovemeet.invalid) that
    // can never receive mail — never try to email it (it just bounces).
    const { data: userRes } = await admin.auth.admin.getUserById(n.user_id)
    const rawEmail = userRes?.user?.email ?? null
    const email = rawEmail && !/\.invalid$/i.test(rawEmail) ? rawEmail : null

    // Actor name + avatar for the message. Prefer display_name; fall back to
    // the handle WITHOUT a leading '@' (the prefix made notifications read as
    // "@vee liked your post" — we want "vee liked your post").
    let actor = 'Someone'
    let actorAvatarUrl: string | null = null
    if (n.actor_id) {
      const { data: a } = await admin
        .from('profiles')
        .select('handle, display_name, first_name, avatar_url')
        .eq('id', n.actor_id)
        .maybeSingle()
      if (a) {
        const stripAt = (s: string | null) => (s ? s.replace(/^@+/, '') : null)
        actor = a.display_name?.trim()
          || a.first_name?.trim()
          || stripAt(a.handle)
          || 'Someone'
        actorAvatarUrl = a.avatar_url ?? null
      }
    }

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

    // Game notifications need extra context: which game (label + emoji +
    // graphic URL) and the deep-link path back into the game lobby. The body
    // field holds the invite_code; we look up the game_type so we can show
    // "Vee invited you to play Pixel Rush" instead of the generic "New
    // activity", route the CTA to /play/<code>, and send the per-game
    // graphic as the Telegram preview photo instead of the inviter's selfie.
    let gameMeta: { label: string; emoji: string; image: string | null } | null = null
    if ((n.type === 'game_invite' || n.type === 'game_join' || n.type === 'game_waiting') && n.body) {
      const { data: g } = await admin
        .from('games')
        .select('game_type')
        .eq('invite_code', n.body)
        .maybeSingle()
      const META: Record<string, { label: string; emoji: string; image: string }> = {
        pixel_rush:  { label: 'Pixel Rush',  emoji: '🧩', image: '/pixel-rush.png' },
        number_duel: { label: 'Number Duel', emoji: '🔢', image: '/number-duel.png' },
        draughts:    { label: 'Draughts',    emoji: '♟',  image: '/draughts.png' },
      }
      const m = g?.game_type ? META[g.game_type as keyof typeof META] : null
      gameMeta = m
        ? { label: m.label, emoji: m.emoji, image: appUrl ? `${appUrl}${m.image}` : null }
        : { label: 'a game', emoji: '🎮', image: null }
    }

    const link = linkFor(n, appUrl)
    const firstName = profile?.first_name ?? profile?.display_name ?? 'there'
    const c = content(n, actor, gameMeta)

    const result: Record<string, unknown> = { ok: true }
    const errors: string[] = []

    // A chat message is only emailed when the recipient is OFFLINE — online
    // users get an in-app sound + browser notification instead, so the inbox
    // isn't flooded during a live conversation.
    const emailAllowedForType = n.type !== 'chat_message' || !isOnline

    // ----- Email (Gmail SMTP) -----
    if (emailOn && email && emailAllowedForType) {
      try {
        const html = renderEmail({ firstName, appUrl, link, icon: c.icon, accent: c.accent, title: c.title, message: c.message, cta: c.cta })
        const host = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
        const port = Number(Deno.env.get('SMTP_PORT') ?? '465')
        const user = Deno.env.get('SMTP_USER')
        const pass = Deno.env.get('SMTP_PASS')
        if (!user || !pass) throw new Error('SMTP not configured')
        const fromRaw = (Deno.env.get('SMTP_FROM') ?? user).trim()
        const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim()
        // @ts-expect-error — Deno-resolved at runtime.
        const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
        const smtp = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } })
        await smtp.send({ from: `Love meet <${fromEmail}>`, to: email, subject: c.subject, html, content: c.message })
        await smtp.close()
        result.email = email
      } catch (e) { errors.push(`email: ${(e as Error).message}`) }
    }

    // ----- Telegram (bot) -----
    if (tgOn && tgChatId) {
      try {
        const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')
        const text = `<b>${escapeHtml(c.title)}</b>\n\n${escapeHtml(c.message)}`

        // Build the inline keyboard. Telegram recipients are already inside
        // Telegram — open the Mini App via `web_app`, never the browser. This
        // keeps them on the surface they're signed into (no identity split,
        // no re-auth, no duplicate account). Works for any URL on the same
        // domain as the bot's configured Mini App.
        const httpLink = /^https?:\/\//.test(link) ? link : null
        const reply_markup = httpLink
          ? { inline_keyboard: [[{ text: c.cta, web_app: { url: httpLink } }]] }
          : undefined

        // Pick the right photo for the notification preview:
        //   • Game invites/joins/waiting → the game's graphic (so the user
        //     sees "Pixel Rush" art, not the inviter's selfie).
        //   • Everything else            → the actor's avatar (face of the
        //     person who liked/commented/messaged).
        const photoUrl = gameMeta?.image ?? actorAvatarUrl

        // If we have a photo, send as PHOTO so it appears in the preview.
        // Otherwise (no avatar, no game graphic) fall back to plain text.
        const tgRes = photoUrl
          ? await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChatId,
                photo: photoUrl,
                caption: text,
                parse_mode: 'HTML',
                reply_markup,
              }),
            })
          : await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: tgChatId, text, parse_mode: 'HTML', reply_markup }),
            })

        // If sendPhoto failed (Telegram couldn't fetch the image URL — common
        // for game graphics if the image file isn't on the server yet), fall
        // back to sendMessage so the user still gets the notification.
        if (!tgRes.ok && photoUrl) {
          const fallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tgChatId, text, parse_mode: 'HTML', reply_markup }),
          })
          if (!fallback.ok) {
            throw new Error(`telegram ${fallback.status}: ${(await fallback.text()).slice(0, 160)}`)
          }
        } else if (!tgRes.ok) {
          throw new Error(`telegram ${tgRes.status}: ${(await tgRes.text()).slice(0, 160)}`)
        }
        result.telegram = tgChatId
      } catch (e) { errors.push(`telegram: ${(e as Error).message}`) }
    }

    if (errors.length) result.errors = errors
    if (!result.email && !result.telegram) result.skipped = 'no channel delivered'
    return json(result)
  } catch (e) {
    // Return 200 with the error so it's readable from the test call + logs.
    return json({ ok: false, error: `send error: ${(e as Error)?.message ?? String(e)}` }, 200)
  }
})

/** Where the CTA/notification points, per type. */
function linkFor(n: Notification, appUrl: string): string {
  if ((n.type === 'gift' || n.type === 'gift_accepted' || n.type === 'gift_rejected') && n.gift_id) {
    return `${appUrl}/gift/${n.gift_id}`
  }
  if ((n.type === 'chat_message' || n.type === 'chat_reminder') && n.conversation_id) {
    return `${appUrl}/chat/${n.conversation_id}`
  }
  if (n.type === 'support_user_msg') return `${appUrl}/admin/support`
  if (n.type === 'support_reply') return `${appUrl}/support`
  if (n.type === 'welcome' || n.type === 'welcome_signup') return `${appUrl}/guide`
  if (n.post_id) return `${appUrl}/p/${n.post_id}`
  if (n.type === 'deposit') return `${appUrl}/wallet`
  if (n.type === 'launch_bonus') return `${appUrl}/wallet`
  if (n.type === 'subscription_expired') return `${appUrl}/subscription`
  if (n.type === 'referral_joined') return `${appUrl}/affiliate`
  if (n.type === 'follow' && n.actor_id) return `${appUrl}/profile/${n.actor_id}`
  if (n.type.startsWith('withdrawal')) return `${appUrl}/earnings`
  // Game invites/joins/waiting: body is the invite_code. Deep-link straight
  // to the lobby so the user lands in the game, not in a notification list.
  if ((n.type === 'game_invite' || n.type === 'game_join' || n.type === 'game_waiting') && n.body) {
    return `${appUrl}/play/${n.body}`
  }
  return `${appUrl}/notifications`
}

type EmailContent = { subject: string; title: string; message: string; icon: string; accent: string; cta: string }

const ROSE = '#FF3D8E'
const GOLD = '#35CDE8'
const GREEN = '#3ED598'
const RED = '#FF5C7A'

function content(
  n: Notification,
  actor: string,
  gameMeta: { label: string; emoji: string; image: string | null } | null,
): EmailContent {
  const q = (s: string | null) => (s ? `“${s}”` : '')
  switch (n.type) {
    case 'like':
      return { subject: `${actor} liked your post`, title: 'New like ❤️', icon: '❤️', accent: ROSE, cta: 'View post',
        message: `${actor} liked your post on Love meet.` }
    case 'comment':
      return { subject: `${actor} commented on your post`, title: 'New comment 💬', icon: '💬', accent: ROSE, cta: 'View comment',
        message: `${actor} commented on your post: ${q(n.body)}` }
    case 'reply':
      return { subject: `${actor} replied to you`, title: 'New reply ↩️', icon: '↩️', accent: ROSE, cta: 'View reply',
        message: `${actor} replied to you: ${q(n.body)}` }
    case 'comment_like':
      return { subject: `${actor} liked your comment`, title: 'Comment liked 👍', icon: '👍', accent: ROSE, cta: 'View comment',
        message: `${actor} liked your comment on Love meet.` }
    case 'reply_like':
      return { subject: `${actor} liked your reply`, title: 'Reply liked 👍', icon: '👍', accent: ROSE, cta: 'View reply',
        message: `${actor} liked your reply on Love meet.` }
    case 'gift':
      return { subject: `${actor} sent you a gift`, title: 'You received a gift 🎁', icon: '🎁', accent: ROSE, cta: 'Open gift',
        message: `${actor} sent you a gift${n.body ? `: ${n.body}` : ''}. Open Love meet to accept it.` }
    case 'gift_accepted':
      return { subject: `Your gift was accepted`, title: 'Gift accepted 🎉', icon: '🎉', accent: GREEN, cta: 'View',
        message: `${actor} accepted your gift${n.body ? `: ${n.body}` : ''}. Thank you for sharing the love.` }
    case 'gift_rejected':
      return { subject: `Your gift was declined`, title: 'Gift declined', icon: '🎁', accent: GOLD, cta: 'View',
        message: `${actor} declined your gift${n.body ? `: ${n.body}` : ''}. No charge was made.` }
    case 'match_post':
      return { subject: `Someone you might like just posted`, title: 'New match activity ✨', icon: '✨', accent: ROSE, cta: 'See the post',
        message: `${actor} — who matches your preferences — just shared a new post on Love meet.` }
    case 'welcome_signup':
      return { subject: `You said yes 💘 Welcome to Love meet`, title: "You're in 💘", icon: '💘', accent: ROSE, cta: 'Set up your profile',
        message: n.body ?? "Welcome to Love meet — the boldest swipe you'll make today. Someone out there is hoping you show up. Let's set up your profile and go find them." }
    case 'welcome':
      return { subject: `Your Love meet profile is live 💕`, title: 'Looking lovely 💕', icon: '💖', accent: ROSE, cta: 'Make the first move',
        message: n.body ?? "Your profile is live and looking lovely. The right person could be one hello away — so don't be shy. Make the first move." }
    case 'deposit':
      return { subject: `Deposit received ✅`, title: 'Deposit received', icon: '✅', accent: GREEN, cta: 'View wallet',
        message: n.body ?? 'Your deposit was received and added to your wallet.' }
    case 'withdrawal':
      return { subject: `Withdrawal request received`, title: 'Withdrawal requested', icon: '⏳', accent: GOLD, cta: 'View earnings',
        message: n.body ?? 'Your withdrawal request is being reviewed by our team.' }
    case 'withdrawal_sent':
      return { subject: `Your withdrawal has been sent 💸`, title: 'Withdrawal sent', icon: '💸', accent: GREEN, cta: 'View earnings',
        message: n.body ?? 'Your withdrawal has been sent to your bank account.' }
    case 'withdrawal_rejected':
      return { subject: `Your withdrawal was rejected`, title: 'Withdrawal rejected', icon: '⚠️', accent: RED, cta: 'View earnings',
        message: n.body ?? 'Your withdrawal was rejected and the amount refunded to your wallet.' }
    case 'password_changed':
      return { subject: `Your password was changed 🔒`, title: 'Password changed', icon: '🔒', accent: GOLD, cta: 'Review security',
        message: n.body ?? "Your password was just changed. If this wasn't you, secure your account immediately." }
    case 'chat_reminder':
      return { subject: `You have an unread message 💬`, title: 'Unread message', icon: '💬', accent: ROSE, cta: 'Reply now',
        message: n.body ?? 'You have an unread message waiting for a reply on Love meet.' }
    case 'chat_message':
      return { subject: `${actor} sent you a message 💬`, title: 'New message', icon: '✉️', accent: ROSE, cta: 'Open chat',
        message: `${actor} sent you a message${n.body ? `: “${n.body}”` : '.'}` }
    case 'support_user_msg':
      return { subject: `New live-support message`, title: 'New support message 🛟', icon: '🛟', accent: GOLD, cta: 'Open support inbox',
        message: `${actor} sent a message to live support${n.body ? `: “${n.body}”` : '.'}` }
    case 'support_reply':
      return { subject: `Support replied to you 🛟`, title: 'Support replied', icon: '🛟', accent: ROSE, cta: 'View reply',
        message: `Our support team replied${n.body ? `: “${n.body}”` : '.'}` }
    case 'launch_bonus':
      return { subject: `🎁 We added $3 to your balance`, title: 'Welcome gift unlocked 🎁', icon: '🎁', accent: ROSE, cta: 'Open wallet',
        message: n.body ?? "We've added $3 to your balance to celebrate our launch. Send a gift, go premium, or spread the love!" }
    case 'subscription_expired':
      return { subject: `Your plan has ended 💔`, title: 'Back on Free', icon: '💔', accent: GOLD, cta: 'Resubscribe',
        message: n.body ?? "Your plan has ended — you're back on the Free plan. Resubscribe anytime to keep your perks. 💕" }
    case 'referral_joined':
      return { subject: `🎉 ${actor} joined with your invite`, title: 'Your invite converted 🎉', icon: '🤝', accent: GREEN, cta: 'View affiliate',
        message: `${actor} just joined Love meet using your invite. You'll earn 5% of everything they spend on subscriptions — for life.` }
    case 'follow':
      return { subject: `${actor} started following you`, title: 'New follower 👤', icon: '👤', accent: ROSE, cta: 'View profile',
        message: `${actor} started following you on Love meet.` }

    // ── Game notifications ─────────────────────────────────────────────
    // body holds the invite code; gameMeta is looked up from games.game_type.
    case 'game_invite': {
      const label = gameMeta?.label ?? 'a game'
      const emoji = gameMeta?.emoji ?? '🎮'
      return {
        subject: `${actor} invited you to play ${label}`,
        title: `${label} invite ${emoji}`,
        icon: emoji,
        accent: ROSE,
        cta: 'Join game',
        message: `${actor} invited you to play ${label}. Tap below to jump straight into the lobby.`,
      }
    }
    case 'game_join': {
      const label = gameMeta?.label ?? 'your game'
      const emoji = gameMeta?.emoji ?? '🎮'
      return {
        subject: `${actor} joined your ${label} game`,
        title: `${label} — someone joined ${emoji}`,
        icon: emoji,
        accent: GREEN,
        cta: 'Go to game',
        message: `${actor} joined your ${label} game. Tap below to start the match.`,
      }
    }
    case 'game_waiting': {
      const label = gameMeta?.label ?? 'your game'
      const emoji = gameMeta?.emoji ?? '🎮'
      return {
        subject: `${label} is waiting on you`,
        title: `${label} — your turn ${emoji}`,
        icon: emoji,
        accent: GOLD,
        cta: 'Continue',
        message: `${label} is waiting on you. Tap below to take your turn before the match auto-forfeits.`,
      }
    }

    default:
      return { subject: 'New activity on Love meet', title: 'New activity', icon: '🔔', accent: ROSE, cta: 'Open Love meet',
        message: n.body ?? 'You have new activity on Love meet.' }
  }
}

/**
 * Professional, cross-client transactional email — LIGHT theme (renders
 * predictably; dark emails get inverted inconsistently by clients). Pure
 * table layout + inline styles, a text wordmark (no fragile logo image), a
 * hidden preheader, an icon badge, and a bulletproof CTA button.
 */
function renderEmail(o: {
  firstName: string; appUrl: string; link: string
  icon: string; accent: string; title: string; message: string; cta: string
}): string {
  const { firstName, appUrl, link, icon, accent, title, message, cta } = o
  const BRAND = '#E11D74' // wordmark rose (reads well on white)
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f1f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f3f1f6;">${escapeHtml(message)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1f6;">
<tr><td align="center" style="padding:32px 14px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;font-family:'Segoe UI',-apple-system,Roboto,Helvetica,Arial,sans-serif;">

    <!-- Wordmark -->
    <tr><td align="center" style="padding:0 0 18px;">
      <span style="font-size:24px;font-weight:800;letter-spacing:.02em;color:${BRAND};">Love&nbsp;meet</span>
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#a59fb3;margin-top:4px;">where hearts meet</div>
    </td></tr>

    <!-- Card -->
    <tr><td style="background:#ffffff;border-radius:18px;border:1px solid #ececf1;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:5px;background:${accent};"></td></tr>
        <tr><td style="padding:34px 32px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center"
                style="width:76px;height:76px;background:${accent}1f;border-radius:50%;font-size:36px;line-height:76px;">${icon}</td></tr></table>
            </td></tr>
            <tr><td align="center" style="padding-bottom:14px;color:#14111c;font-size:23px;font-weight:800;letter-spacing:-.01em;">${escapeHtml(title)}</td></tr>
            <tr><td style="color:#3f3b4d;font-size:15px;line-height:1.65;padding-bottom:6px;">Hi ${escapeHtml(firstName)},</td></tr>
            <tr><td style="color:#56516a;font-size:16px;line-height:1.7;padding-bottom:28px;">${escapeHtml(message)}</td></tr>
            <tr><td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td align="center" bgcolor="${accent}" style="border-radius:999px;">
                  <a href="${link}" style="display:inline-block;padding:15px 40px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:999px;">${escapeHtml(cta)} &rarr;</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:22px 24px 8px;">
      <p style="margin:0;text-align:center;color:#9a96a8;font-size:12px;line-height:1.7;">
        You're receiving this because email notifications are on for your Love meet account.<br>
        <a href="${appUrl}/security" style="color:${BRAND};text-decoration:none;font-weight:600;">Manage email preferences</a>
      </p>
      <p style="margin:12px 0 0;text-align:center;color:#bdb9c8;font-size:11px;">© Love meet · Made with 💕</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
