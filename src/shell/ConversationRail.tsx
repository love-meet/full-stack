import { Link } from 'react-router-dom'
import { useConversations, type Conversation } from '../hooks/useConversations'
import { useActiveConversation } from '../stores/activeConversation'
import { useRelations } from '../hooks/useFollow'
import { avatarUrlOr } from '../lib/avatar'
import BlueTick from '../components/BlueTick'
import { ChatPane } from '../screens/ChatDetailScreen'

/**
 * Desktop-only (xl+) right rail: a persistent conversations panel. Shows the
 * chat list; clicking a conversation opens it in place (no full-screen route).
 * Mobile keeps using the /chat list + /chat/:id full-screen route.
 */
export default function ConversationRail() {
  const activeId = useActiveConversation((s) => s.id)
  const open = useActiveConversation((s) => s.open)
  const close = useActiveConversation((s) => s.close)

  return (
    <aside
      className="hidden xl:flex flex-col w-[22rem] shrink-0 glass border-l border-white/5 sticky top-0 h-screen"
      aria-label="Conversations"
    >
      {activeId ? (
        <ChatPane conversationId={activeId} onBack={close} className="h-full" />
      ) : (
        <ConversationList onOpen={open} />
      )}
    </aside>
  )
}

function ConversationList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useConversations()
  const items = q.data ?? []
  const relations = useRelations(items.map((c) => c.other_id))

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-white/5">
        <span className="font-extrabold text-ink">Messages</span>
        <Link to="/search" className="text-ink-2 hover:text-rose text-lg" aria-label="New message">✎</Link>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {q.status === 'pending' && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        )}

        {q.status === 'success' && items.length === 0 && (
          <div className="h-full grid place-items-center text-center px-6">
            <div>
              <div className="text-4xl mb-2">💬</div>
              <p className="text-sm text-ink-muted">No conversations yet. Find someone and say hi.</p>
            </div>
          </div>
        )}

        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
              >
                <img
                  src={avatarUrlOr(c.other_avatar_url)}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink truncate flex items-center gap-1">
                      @{c.other_handle ?? c.other_display_name ?? 'unknown'}
                      {c.other_id && relations.data?.get(c.other_id)?.is_subscriber && <BlueTick size={13} />}
                    </span>
                    {c.last_message_at && (
                      <span className="text-[10px] text-ink-muted shrink-0">{timeAgo(c.last_message_at)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-ink-muted truncate">
                      {preview(c)}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function preview(c: Conversation): string {
  if (!c.last_message_preview) return 'Say hi 👋'
  return c.last_message_preview
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString()
}
