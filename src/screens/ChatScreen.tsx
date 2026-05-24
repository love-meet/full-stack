import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import ScreenHeader from '../shell/ScreenHeader'
import { stagger, itemUp } from '../shell/motion'
import { useConversations, type Conversation } from '../hooks/useConversations'
import { useConversationsRealtime } from '../hooks/useChatRealtime'
import { useTypingMap } from '../hooks/useTyping'
import { useIsOnline } from '../stores/presence'
import { useAuth } from '../stores/auth'
import { avatarUrlOr } from '../lib/avatar'

export default function ChatScreen() {
  useConversationsRealtime()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const convs = useConversations()
  const typingMap = useTypingMap()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return convs.data ?? []
    return (convs.data ?? []).filter((c) => {
      const name = (c.other_handle ?? c.other_display_name ?? '').toLowerCase()
      const preview = (c.last_message_preview ?? '').toLowerCase()
      return name.includes(term) || preview.includes(term)
    })
  }, [convs.data, q])

  const isEmpty = convs.status === 'success' && (convs.data ?? []).length === 0

  return (
    <div className="min-h-full relative">
      <ScreenHeader
        title="Chat"
        subtitle="Direct messages with the people you connect with."
      />

      <div className="px-5 sm:px-8">
        <div className="glass rounded-full px-4 py-2.5 flex items-center gap-2 focus-within:ring-brand transition-shadow">
          <span className="text-ink-muted">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent outline-none placeholder:text-ink-muted text-sm"
          />
        </div>
      </div>

      {convs.status === 'pending' && (
        <div className="px-5 sm:px-8 pt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      )}

      {convs.status === 'error' && (
        <div className="px-5 sm:px-8 pt-4">
          <div className="glass rounded-2xl p-5 text-sm text-danger">
            Couldn't load chats: {(convs.error as Error).message}
          </div>
        </div>
      )}

      {isEmpty && <EmptyState />}

      <motion.ul
        className="px-2 sm:px-5 pt-3 pb-28"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {filtered.map((c) => (
          <motion.li key={c.id} variants={itemUp}>
            <ConversationRow
              c={c}
              mySenderId={myId}
              isTyping={!!typingMap[c.id]}
            />
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}

function ConversationRow({
  c, mySenderId, isTyping,
}: {
  c: Conversation
  mySenderId: string | null
  isTyping: boolean
}) {
  const youSent = c.last_sender_id && c.last_sender_id === mySenderId
  const online = useIsOnline(c.other_id)
  const fallbackPreview = c.last_message_preview
    ? (youSent ? `You: ${c.last_message_preview}` : c.last_message_preview)
    : 'Say hi.'

  return (
    <Link
      to={`/chat/${c.id}`}
      className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/[0.04] transition-colors"
    >
      <div className="relative shrink-0">
        <img
          src={avatarUrlOr(c.other_avatar_url)}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
        />
        {online && (
          <span
            className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success ring-2 ring-surface"
            aria-label="Online"
          />
        )}
        {c.unread_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-rose text-[10px] font-bold grid place-items-center text-white">
            {c.unread_count > 99 ? '99+' : c.unread_count}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-ink truncate flex items-center gap-1">
            {c.my_pinned_at && (
              <span className="text-coral text-xs leading-none shrink-0" aria-label="Pinned">📌</span>
            )}
            @{c.other_handle ?? c.other_display_name ?? 'unknown'}
          </span>
          <span className="text-[11px] text-ink-muted shrink-0">{timeAgo(c.last_message_at)}</span>
        </div>
        {isTyping ? (
          <p className="text-sm truncate text-success italic font-semibold">typing…</p>
        ) : (
          <p
            className={`text-sm truncate ${
              c.unread_count > 0 && !youSent ? 'text-ink-2 font-semibold' : 'text-ink-muted'
            }`}
          >
            {fallbackPreview}
          </p>
        )}
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="px-5 sm:px-8 pt-4">
      <div className="glass rounded-3xl p-8 text-center">
        <div className="text-4xl mb-3">💬</div>
        <p className="text-ink font-semibold mb-1">No conversations yet</p>
        <p className="text-sm text-ink-muted">
          Open someone's profile and tap <span className="text-ink-2 font-semibold">Send Message</span> to start a chat.
        </p>
      </div>
    </div>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / 86400 / 7)}w`
}
