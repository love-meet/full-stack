import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMyTickets, useOpenTicket, useTicketsRealtime, type SupportTicket } from '../../hooks/useSupport'

/**
 * User-facing live support: a list of the user's tickets plus a composer to
 * open a new one. Tapping a ticket opens the chat thread with an admin.
 */
export default function SupportScreen() {
  const navigate = useNavigate()
  const tickets = useMyTickets()
  const open = useOpenTicket()
  useTicketsRealtime()

  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = tickets.data ?? []
  const canSend = subject.trim().length >= 3 && message.trim().length >= 5 && !open.isPending

  async function submit() {
    if (!canSend) return
    setError(null)
    try {
      const t = await open.mutateAsync({ subject: subject.trim(), message: message.trim() })
      setComposing(false)
      setSubject('')
      setMessage('')
      navigate(`/support/${t.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-28">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">Live support</div>
          <button
            onClick={() => { setComposing(true); setError(null) }}
            className="text-sm font-bold px-3 py-1.5 rounded-full bg-gradient-brand text-white glow-rose"
          >
            New
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <p className="text-sm text-ink-2 mb-5">
          Chat directly with our team. Open a ticket and we'll reply right here —
          replies show up live and your tickets keep their full history.
        </p>

        {tickets.status === 'pending' && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        )}

        {tickets.status === 'success' && list.length === 0 && !composing && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-ink font-semibold mb-1">No tickets yet</p>
            <p className="text-sm text-ink-muted mb-4">
              Have a question or an issue? Start a conversation with support.
            </p>
            <button
              onClick={() => setComposing(true)}
              className="rounded-full px-5 py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose"
            >
              Contact support
            </button>
          </div>
        )}

        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <TicketRow ticket={t} onOpen={() => navigate(`/support/${t.id}`)} />
            </li>
          ))}
        </ul>
      </main>

      <AnimatePresence>
        {composing && (
          <NewTicketSheet
            subject={subject}
            message={message}
            error={error}
            busy={open.isPending}
            canSend={canSend}
            onSubject={setSubject}
            onMessage={setMessage}
            onClose={() => setComposing(false)}
            onSubmit={submit}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function TicketRow({ ticket, onOpen }: { ticket: SupportTicket; onOpen: () => void }) {
  const unread = ticket.user_unread > 0
  return (
    <button
      onClick={onOpen}
      className="w-full text-left glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
    >
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(ticket.status)}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink truncate">{ticket.subject}</span>
          <StatusPill status={ticket.status} />
        </div>
        <div className={`text-[13px] truncate ${unread ? 'text-ink-2 font-semibold' : 'text-ink-muted'}`}>
          {ticket.last_sender_is_admin ? 'Support: ' : 'You: '}
          {ticket.last_message_preview ?? '…'}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[11px] text-ink-muted">{timeAgo(ticket.last_message_at)}</span>
        {unread && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose text-[10px] font-bold grid place-items-center text-white">
            {ticket.user_unread}
          </span>
        )}
      </div>
    </button>
  )
}

function NewTicketSheet({
  subject, message, error, busy, canSend,
  onSubject, onMessage, onClose, onSubmit,
}: {
  subject: string
  message: string
  error: string | null
  busy: boolean
  canSend: boolean
  onSubject: (v: string) => void
  onMessage: (v: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-5 m-0 sm:m-4"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-ink">New support ticket</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink text-xl px-1">✕</button>
        </div>

        <label className="block mb-3">
          <div className="text-xs font-bold text-ink-2 mb-1.5">Subject</div>
          <input
            type="text"
            maxLength={160}
            value={subject}
            onChange={(e) => onSubject(e.target.value)}
            placeholder="e.g. Withdrawal not received"
            className="lm-input"
            autoFocus
          />
        </label>

        <label className="block mb-2">
          <div className="text-xs font-bold text-ink-2 mb-1.5">How can we help?</div>
          <textarea
            value={message}
            onChange={(e) => onMessage(e.target.value.slice(0, 4000))}
            rows={4}
            placeholder="Describe your issue in detail…"
            className="lm-input resize-none no-scrollbar"
          />
        </label>

        {error && <p className="text-xs text-danger mb-2">{error}</p>}

        <button
          onClick={onSubmit}
          disabled={!canSend}
          className={[
            'w-full rounded-full py-3 text-sm font-bold transition-opacity',
            canSend ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
          ].join(' ')}
        >
          {busy ? 'Sending…' : 'Send to support'}
        </button>
      </motion.div>
    </motion.div>
  )
}

// ---------- shared bits ----------

export function StatusPill({ status }: { status: SupportTicket['status'] }) {
  const map: Record<SupportTicket['status'], string> = {
    open: 'bg-success/15 text-success',
    resolved: 'bg-coral/15 text-coral',
    closed: 'bg-ink-muted/15 text-ink-muted',
  }
  return (
    <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  )
}

export function statusDot(status: SupportTicket['status']): string {
  return status === 'open' ? 'bg-success' : status === 'resolved' ? 'bg-coral' : 'bg-ink-muted/50'
}

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / 86400 / 7)}w`
}
