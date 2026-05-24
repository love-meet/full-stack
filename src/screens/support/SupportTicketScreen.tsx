import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useIsAdmin } from '../../hooks/useAdmin'
import {
  useTicket,
  useTicketMessages,
  useSendSupportMessage,
  useSetTicketStatus,
  useTicketRealtime,
  markTicketRead,
  type SupportMessage,
  type SupportStatus,
} from '../../hooks/useSupport'
import { StatusPill } from './SupportScreen'

/**
 * One support ticket as a chat thread. Shared by the user (who opened it)
 * and admins (who reply). Alignment is role-aware: your own side sits on
 * the right. Admins get status controls in the header.
 */
export default function SupportTicketScreen() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()

  const ticketQ = useTicket(ticketId)
  const messagesQ = useTicketMessages(ticketId)
  const send = useSendSupportMessage(ticketId ?? '')
  const setStatus = useSetTicketStatus()
  useTicketRealtime(ticketId)

  const [text, setText] = useState('')
  const messages = messagesQ.data ?? []
  const ticket = ticketQ.data

  // Mark read on mount + whenever new messages land.
  useEffect(() => {
    if (ticketId) void markTicketRead(ticketId)
  }, [ticketId, messages.length])

  const taRef = useRef<HTMLTextAreaElement | null>(null)
  function resize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }
  useEffect(resize, [text])

  const canSend = text.trim().length > 0 && !send.isPending

  async function submit() {
    if (!canSend) return
    const body = text.trim()
    setText('')
    try {
      await send.mutateAsync(body)
    } catch {
      setText(body) // restore for retry
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  async function changeStatus(s: SupportStatus) {
    if (!ticketId) return
    await setStatus.mutateAsync({ ticketId, status: s })
  }

  const headerTitle = ticket
    ? isAdmin
      ? `@${ticket.user_handle ?? ticket.user_display_name ?? 'user'}`
      : ticket.subject
    : '…'

  return (
    <div className="h-screen flex flex-col text-ink">
      <header
        className="shrink-0 glass border-b border-white/5 px-3 py-3 flex items-center gap-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="text-ink-2 hover:text-ink text-2xl leading-none px-1"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate flex items-center gap-2">
            <span className="truncate">{headerTitle}</span>
            {ticket && <StatusPill status={ticket.status} />}
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            {isAdmin ? ticket?.subject : 'Support team'}
          </div>
        </div>
      </header>

      {/* Admin status controls */}
      {isAdmin && ticket && (
        <div className="shrink-0 flex gap-2 px-3 py-2 border-b border-white/5 overflow-x-auto no-scrollbar">
          {(['open', 'resolved', 'closed'] as SupportStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              disabled={ticket.status === s || setStatus.isPending}
              className={[
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                ticket.status === s
                  ? 'bg-gradient-brand text-white'
                  : 'glass text-ink-2 hover:text-ink',
              ].join(' ')}
            >
              {s === 'open' ? 'Reopen' : `Mark ${s}`}
            </button>
          ))}
        </div>
      )}

      <MessagesList messages={messages} viewerIsAdmin={isAdmin} loading={messagesQ.status === 'pending'} />

      {/* Composer */}
      <div
        className="shrink-0 glass border-t border-white/5 px-3 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {ticket?.status === 'closed' && !isAdmin && (
          <p className="text-[11px] text-ink-muted px-2 pb-2">
            This ticket was closed — replying will reopen it.
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 glass rounded-3xl px-4 py-2 focus-within:ring-brand transition-shadow">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 4000))}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={isAdmin ? 'Reply to this user…' : 'Message support…'}
              className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-base resize-none leading-snug no-scrollbar"
            />
          </div>
          <button
            onClick={submit}
            disabled={!canSend}
            className={[
              'rounded-full w-11 h-11 grid place-items-center text-lg shrink-0 transition-opacity',
              canSend ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
            ].join(' ')}
            aria-label="Send"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

function MessagesList({
  messages, viewerIsAdmin, loading,
}: { messages: SupportMessage[]; viewerIsAdmin: boolean; loading: boolean }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-4 px-3 no-scrollbar">
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`glass h-10 rounded-2xl animate-pulse w-2/3 ${i % 2 ? 'ml-auto' : ''}`} />
          ))}
        </div>
      )}

      <ul className="space-y-1.5">
        {messages.map((m) => {
          // Your own side sits on the right: a user sees their (non-admin)
          // messages right; an admin sees admin messages right.
          const mine = m.is_admin === viewerIsAdmin
          return (
            <motion.li
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex ${mine ? 'justify-end' : 'justify-start'} px-1`}
            >
              <div
                className={[
                  'relative max-w-[80%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words shadow-sm',
                  mine
                    ? 'bg-gradient-brand text-white rounded-br-md'
                    : 'glass text-ink rounded-bl-md',
                ].join(' ')}
              >
                {/* Tag the support side so the user knows who's talking. */}
                {m.is_admin && !viewerIsAdmin && (
                  <div className="text-[10px] font-bold uppercase tracking-wider text-coral mb-0.5">
                    Support
                  </div>
                )}
                <span>{m.body}</span>
                <div className={`mt-1 text-[10px] text-right ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                  {fmtTime(m.created_at)}
                </div>
              </div>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
