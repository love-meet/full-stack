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
    else if (n.type === 'launch_bonus') navigate('/wallet')
    else if (n.type === 'subscription_expired') navigate('/subscription')
    else if (n.type === 'referral_joined') navigate('/affiliate')
    else if (n.type === 'follow' && n.actor_id) navigate(`/profile/${n.actor_id}`)
    else if (n.type === 'new_member_nearby' && n.actor_id) navigate(`/profile/${n.actor_id}`)
    else if (n.type === 'deposit') navigate('/wallet')
    else if (n.type.startsWith('withdrawal')) navigate('/earnings')
    else if (n.type === 'password_changed') navigate('/security')
    else if (n.type === 'chat_reminder' || n.type === 'chat_message') navigate('/chat')
    else if (n.type === 'support_user_msg') navigate('/admin/support')
    else if (n.type === 'support_reply') navigate('/support')
    // Game-related notifications carry the invite code in body → /play/CODE.
    else if ((n.type === 'game_invite' || n.type === 'game_join' || n.type === 'game_waiting') && n.body) {
      navigate(`/play/${n.body}`)
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

function message(n: AppNotification): React.ReactNode {
  const who = <span className="font-semibold">{actorName(n)}</span>
  switch (n.type) {
    case 'like': return <>{who} liked your post.</>
    case 'comment': return <>{who} commented: <span className="text-ink-2">“{n.body}”</span></>
    case 'reply': return <>{who} replied: <span className="text-ink-2">“{n.body}”</span></>
    case 'comment_like': return <>{who} liked your comment.</>
    case 'reply_like': return <>{who} liked your reply.</>
    case 'gift': return <>{who} sent you a gift{n.body ? <> — <span className="text-ink-2">{n.body}</span></> : ''} 🎁 Tap to accept or decline.</>
    case 'chat_message': return <>{who} sent you a message{n.body ? <>: <span className="text-ink-2">“{n.body}”</span></> : '.'}</>
    case 'referral_joined': return <>{who} joined using your invite 🎉 You'll earn 5% of their subscriptions for life.</>
    case 'follow': return <>{who} started following you.</>
    case 'gift_accepted': return <>{who} accepted your gift{n.body ? <> — <span className="text-ink-2">{n.body}</span></> : ''} 🎉</>
    case 'gift_rejected': return <>{who} declined your gift{n.body ? <> — <span className="text-ink-2">{n.body}</span></> : ''}.</>
    case 'match_post': return <>{who} — who matches your preferences — just posted. ✨</>
    case 'new_member_nearby': return <>{who} just joined Love meet near you 💕 Say hello!</>
    case 'support_user_msg': return <>{who} messaged live support: <span className="text-ink-2">“{n.body}”</span></>
    case 'support_reply': return <>Support replied{n.body ? <>: <span className="text-ink-2">“{n.body}”</span></> : ''} 🛟</>
    case 'game_invite': return <>{who} invited you to play a game 🎮 Tap to join.</>
    case 'game_join': return <>{who} joined your game 🎮 Tap to open the lobby.</>
    case 'game_waiting': return <>⏰ It's your turn — your opponent is waiting. Tap to play.</>
    // Transactional / system notifications carry their full text in body.
    case 'welcome':
    case 'welcome_signup':
    case 'deposit':
    case 'withdrawal':
    case 'withdrawal_sent':
    case 'withdrawal_rejected':
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
    case 'gift_accepted': return '🎉'
    case 'gift_rejected': return '🎁'
    case 'match_post': return '✨'
    case 'new_member_nearby': return '💕'
    case 'welcome': return '💕'
    case 'welcome_signup': return '💘'
    case 'deposit': return '✅'
    case 'withdrawal': return '⏳'
    case 'withdrawal_sent': return '💸'
    case 'withdrawal_rejected': return '⚠️'
    case 'password_changed': return '🔒'
    case 'chat_reminder': return '💬'
    case 'chat_message': return '✉️'
    case 'support_user_msg': return '🛟'
    case 'support_reply': return '🛟'
    case 'launch_bonus': return '🎁'
    case 'subscription_expired': return '💔'
    case 'referral_joined': return '🤝'
    case 'follow': return '👤'
    case 'game_invite': return '🎮'
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
