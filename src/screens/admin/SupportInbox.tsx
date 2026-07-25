import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAllTickets, useTicketsRealtime, type SupportStatus, type SupportTicket } from '../../hooks/useSupport'
import { avatarUrlOr } from '../../lib/avatar'
import { StatusPill, statusDot, timeAgo } from '../support/SupportScreen'

const FILTERS: { id: SupportStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
]

/** Admin support inbox — every ticket, filterable by status. */
export default function SupportInbox() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<SupportStatus | 'all'>('open')
  const tickets = useAllTickets(filter)
  useTicketsRealtime()

  const list = tickets.data ?? []

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={[
              'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
              filter === f.id ? 'bg-gradient-brand text-white glow-rose' : 'glass text-ink-2 hover:text-ink',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tickets.status === 'pending' && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      )}

      {tickets.status === 'success' && list.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center text-sm text-ink-muted">
          No {filter === 'all' ? '' : filter} tickets.
        </div>
      )}

      <ul className="space-y-2">
        {list.map((t) => (
          <li key={t.id}>
            <AdminTicketRow ticket={t} onOpen={() => navigate(`/support/${t.id}`)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AdminTicketRow({ ticket, onOpen }: { ticket: SupportTicket; onOpen: () => void }) {
  const { t } = useTranslation()
  const unread = ticket.admin_unread > 0
  return (
    <button
      onClick={onOpen}
      className="w-full text-left glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
    >
      <div className="relative shrink-0">
        <img
          src={avatarUrlOr(ticket.user_avatar_url)}
          alt=""
          className="w-11 h-11 rounded-full object-cover"
        />
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-surface ${statusDot(ticket.status)}`} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink truncate">
            @{ticket.user_handle ?? ticket.user_display_name ?? 'user'}
          </span>
          <StatusPill status={ticket.status} t={t} />
        </div>
        <div className="text-[13px] text-ink-2 truncate font-medium">{ticket.subject}</div>
        <div className={`text-[12px] truncate ${unread ? 'text-ink-2 font-semibold' : 'text-ink-muted'}`}>
          {ticket.last_sender_is_admin ? 'You: ' : ''}
          {ticket.last_message_preview ?? '…'}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[11px] text-ink-muted">{timeAgo(ticket.last_message_at, t)}</span>
        {unread && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose text-[10px] font-bold grid place-items-center text-white">
            {ticket.admin_unread}
          </span>
        )}
      </div>
    </button>
  )
}
