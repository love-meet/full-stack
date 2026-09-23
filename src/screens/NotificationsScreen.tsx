import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  useNotifications,
  useMarkNotificationsRead,
  useNotificationsRealtime,
  type AppNotification,
} from '../hooks/useNotifications'
import { avatarUrlOr } from '../lib/avatar'

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const list = useNotifications()
  const markRead = useMarkNotificationsRead()
  useNotificationsRealtime()

  const items = list.data ?? []

  // Mark everything read once the screen is open + has loaded.
  useEffect(() => {
    if (list.status === 'success' && items.some((n) => !n.read_at)) {
      markRead.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.status])

  function open(n: AppNotification) {
    // Gift + chat deep-links take precedence over post_id (gifts carry a
    // post_id for context but should open the gift, not the post).
    if ((n.type === 'gift' || n.type === 'gift_accepted' || n.type === 'gift_rejected') && n.gift_id) {
      navigate(`/gift/${n.gift_id}`)
    } else if ((n.type === 'chat_message' || n.type === 'chat_reminder') && n.conversation_id) {
      navigate(`/chat/${n.conversation_id}`)
    } else if (n.post_id) navigate(`/p/${n.post_id}`)
    else if (n.type === 'welcome' || n.type === 'welcome_signup') navigate('/guide')
    else if (n.type === 'launch_bonus') navigate('/credits')
    else if ((n.type === 'follow' || n.type === 'profile_viewed' ||
              n.type === 'profile_comment' || n.type === 'profile_gift') && n.actor_id) {
      navigate(`/profile/${n.actor_id}`)
    }
    else if (n.type === 'password_changed') navigate('/security')
    else if (n.type === 'chat_reminder' || n.type === 'chat_message') navigate('/chat')
    else if (n.type === 'support_user_msg') navigate('/admin/support')
    else if (n.type === 'support_reply') navigate('/support')
    // Games live inside a chat now (§8), so a game notification opens the
    // conversation. `game_join` / `game_waiting` are leftovers from the
    // real-time lobby — they can still exist on old rows, so they route too.
    else if (
      (n.type === 'game_invite' || n.type === 'game_round' ||
       n.type === 'game_join' || n.type === 'game_waiting') &&
      n.conversation_id
    ) {
      navigate(`/chat/${n.conversation_id}`)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Notifications</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 sm:px-6 py-4">
        {list.status === 'pending' && (
          <div className="space-y-2 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        )}

        {list.status === 'success' && items.length === 0 && (
          <div className="glass rounded-3xl p-10 text-center mt-6">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-ink font-semibold mb-1">No notifications yet</p>
            <p className="text-sm text-ink-muted">Likes, comments, gifts and more will show up here.</p>
          </div>
        )}

        <ul className="space-y-1.5">
          {items.map((n) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <button
                onClick={() => open(n)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors',
                  n.read_at ? 'hover:bg-white/[0.04]' : 'bg-rose/[0.06] hover:bg-rose/[0.1]',
                ].join(' ')}
              >
                <div className="relative shrink-0">
                  {n.actor_id ? (
                    <>
                      <img src={avatarUrlOr(n.actor_avatar_url)} alt="" className="w-11 h-11 rounded-full object-cover" />
                      <span className="absolute -bottom-0.5 -right-0.5 text-sm">{glyph(n.type)}</span>
                    </>
                  ) : (
                    <span className="w-11 h-11 rounded-full grid place-items-center text-xl bg-gradient-brand">{glyph(n.type)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink leading-snug">{message(n)}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-rose shrink-0" aria-label="Unread" />}
              </button>
            </motion.li>
          ))}
        </ul>
      </main>
    </div>
  )
}

function actorName(n: AppNotification): string {
  const stripAt = (s: string | null) => (s ? s.replace(/^@+/, '') : null)
  return (
    n.actor_display_name?.trim()
    || stripAt(n.actor_handle)
    || 'Someone'
  )
}

// What 0094's play_chat_move writes when a client omits `p_summary`
// (`coalesce(p_summary, row.kind::text)`) — a bare game-kind id, not prose.
// A `game_round` body equal to one of these (or null/empty) falls back to
// the generic copy instead of being rendered as if it were a sentence.
const GAME_KIND_IDS = new Set([
  'tic_tac_toe',
  'connect_four',
  'rock_paper_scissors',
  'nim',
  'word_guess',
  'dots_and_boxes',
  'draughts',
  'number_duel',
])

// `p_summary` (0094:272) is taken verbatim from the client with no length
// limit on `notifications.body` — a legitimate summary is short, but a
// modified client could push arbitrary-length text into an opponent's
// notification list attributed to them. React escapes it (no XSS), but
// render-time length is still ours to bound. 140 chars is generous for the
// short, fixed-shape summaries every game module actually produces; house
// pattern for this is `tg_notify_comment`'s `substring(new.body for 120)`.
const GAME_ROUND_BODY_MAX = 140

/** `game_round` bodies (withdraw/resign text from 0114, and every game
 *  module's `p_summary`) are phrased to follow "{who} " and don't carry
 *  their own full stop; add one unless the body already ends in
 *  terminal punctuation. Falls back to the pre-0114 fixed copy when there
 *  is no usable body. Truncated to `GAME_ROUND_BODY_MAX` BEFORE the
 *  punctuation check, so a cut string never comes out as "..", and gets
 *  "…" instead of a "." so a mid-word cut doesn't read as a complete
 *  sentence. */
function gameRoundBody(body: string | null): string {
  const raw = body?.trim() ?? ''
  if (!raw || GAME_KIND_IDS.has(raw)) return 'made a move. Your turn.'
  const trimmed = raw.slice(0, GAME_ROUND_BODY_MAX)
  if (trimmed.length < raw.length) return `${trimmed}…`
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function message(n: AppNotification): React.ReactNode {
  const who = <span className="font-semibold">{actorName(n)}</span>
  switch (n.type) {
    case 'like': return <>{who} liked your post.</>
    case 'comment': return <>{who} commented: <span className="text-ink-2">“{n.body}”</span></>
    case 'reply': return <>{who} replied: <span className="text-ink-2">“{n.body}”</span></>
    case 'comment_like': return <>{who} liked your comment.</>
    case 'reply_like': return <>{who} liked your reply.</>
    case 'gift': return <>{who} sent you a gift{n.body ? <> — <span className="text-ink-2">{n.body}</span></> : ''} 🎁</>
    case 'chat_message': return <>{who} sent you a message{n.body ? <>: <span className="text-ink-2">“{n.body}”</span></> : '.'}</>
    case 'follow': return <>{who} started following you.</>
    case 'profile_viewed': return <>{who} looked at your profile.</>
    case 'profile_comment': return <>{who} commented on your profile: <span className="text-ink-2">“{n.body}”</span></>
    case 'profile_gift': return <>{who} sent you a gift{n.body ? <> — <span className="text-ink-2">{n.body}</span></> : ''} 🎁</>
    case 'match_post': return <>{who} — who matches your preferences — just posted. ✨</>
    case 'support_user_msg': return <>{who} messaged live support: <span className="text-ink-2">“{n.body}”</span></>
    case 'support_reply': return <>Support replied{n.body ? <>: <span className="text-ink-2">“{n.body}”</span></> : ''} 🛟</>
    case 'game_invite': return <>{who} invited you to play a game 🎮 Tap to join.</>
    case 'game_round': return <>{who} {gameRoundBody(n.body)}</>
    case 'game_join': return <>{who} joined your game 🎮</>
    case 'game_waiting': return <>⏰ It's your turn — your opponent is waiting. Tap to play.</>
    // Transactional / system notifications carry their full text in body.
    case 'welcome':
    case 'welcome_signup':
    case 'password_changed':
    case 'chat_reminder':
      return <>{n.body}</>
    default: return <>{n.body ?? 'You have new activity.'}</>
  }
}

function glyph(type: AppNotification['type']): string {
  switch (type) {
    case 'like': return '❤️'
    case 'comment': return '💬'
    case 'reply': return '↩️'
    case 'comment_like': return '👍'
    case 'reply_like': return '👍'
    case 'gift': return '🎁'
    case 'profile_gift': return '🎁'
    case 'profile_comment': return '💬'
    case 'gift_accepted': return '🎉'
    case 'gift_rejected': return '🎁'
    case 'match_post': return '✨'
    case 'welcome': return '💕'
    case 'welcome_signup': return '💘'
    case 'password_changed': return '🔒'
    case 'chat_reminder': return '💬'
    case 'chat_message': return '✉️'
    case 'support_user_msg': return '🛟'
    case 'support_reply': return '🛟'
    case 'launch_bonus': return '🎁'
    case 'subscription_expired': return '💔'
    case 'follow': return '👤'
    case 'profile_viewed': return '👀'
    case 'game_invite': return '🎮'
    case 'game_round': return '🎲'
    case 'game_join': return '🎮'
    case 'game_waiting': return '⏰'
    default: return '🔔'
  }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString()
}
