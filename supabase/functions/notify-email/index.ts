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
      .select('email_notifications, telegram_notifications, telegram_user_id, display_name, first_name')
      .eq('id', n.user_id)
      .maybeSingle()
    const emailOn = profile?.email_notifications !== false
    const tgOn = profile?.telegram_notifications === true
    const tgChatId = profile?.telegram_user_id ?? null

    // Recipient email lives on the auth user.
    const { data: userRes } = await admin.auth.admin.getUserById(n.user_id)
    const email = userRes?.user?.email ?? null

    // Actor name for the message.
    let actor = 'Someone'
    if (n.actor_id) {
      const { data: a } = await admin
        .from('profiles')
        .select('handle, display_name')
        .eq('id', n.actor_id)
        .maybeSingle()
      if (a) actor = a.handle ? `@${a.handle}` : (a.display_name ?? 'Someone')
    }

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    const link = linkFor(n, appUrl)
    const firstName = profile?.first_name ?? profile?.display_name ?? 'there'
    const c = content(n, actor)

    const result: Record<string, unknown> = { ok: true }
    const errors: string[] = []

    // ----- Email (Gmail SMTP) -----
    if (emailOn && email) {
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
        const reply_markup = /^https?:\/\//.test(link) ? { inline_keyboard: [[{ text: c.cta, url: link }]] } : undefined
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChatId, text, parse_mode: 'HTML', reply_markup }),
        })
        if (!res.ok) throw new Error(`telegram ${res.status}: ${(await res.text()).slice(0, 160)}`)
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
  if (n.type === 'support_user_msg') return `${appUrl}/admin/support`
  if (n.type === 'support_reply') return `${appUrl}/support`
  if (n.post_id) return `${appUrl}/p/${n.post_id}`
  if (n.type === 'deposit') return `${appUrl}/wallet`
  if (n.type.startsWith('withdrawal')) return `${appUrl}/earnings`
  return `${appUrl}/notifications`
}

type EmailContent = { subject: string; title: string; message: string; icon: string; accent: string; cta: string }

const ROSE = '#FF3D8E'
const GOLD = '#35CDE8'
const GREEN = '#3ED598'
const RED = '#FF5C7A'

function content(n: Notification, actor: string): EmailContent {
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
    case 'support_user_msg':
      return { subject: `New live-support message`, title: 'New support message 🛟', icon: '🛟', accent: GOLD, cta: 'Open support inbox',
        message: `${actor} sent a message to live support${n.body ? `: “${n.body}”` : '.'}` }
    case 'support_reply':
      return { subject: `Support replied to you 🛟`, title: 'Support replied', icon: '🛟', accent: ROSE, cta: 'View reply',
        message: `Our support team replied${n.body ? `: “${n.body}”` : '.'}` }
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
