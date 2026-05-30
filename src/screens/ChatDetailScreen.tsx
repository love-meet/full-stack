import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversation } from '../hooks/useConversations'
import ReturnToGameBanner from '../components/ReturnToGameBanner'
import { useMessages, type Message } from '../hooks/useMessages'
import { useSendMessage } from '../hooks/useSendMessage'
import { useEditMessage } from '../hooks/useMessageMutations'
import { useChatRealtime } from '../hooks/useChatRealtime'
import { useTyping } from '../hooks/useTyping'
import { markConversationRead } from '../hooks/useStartDM'
import { useIsOnline } from '../stores/presence'
import { useAuth } from '../stores/auth'
import { useRelations } from '../hooks/useFollow'
import { avatarUrlOr } from '../lib/avatar'
import BlueTick from '../components/BlueTick'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicatorBubble from '../components/chat/TypingIndicatorBubble'
import MessageActionsSheet from '../components/chat/MessageActionsSheet'
import ChatOptionsSheet from '../components/chat/ChatOptionsSheet'
import { useUploadChatMedia, type ChatMediaUpload } from '../hooks/useUploadChatMedia'

type ComposerMode =
  | { kind: 'idle' }
  | { kind: 'reply'; replyToId: string }
  | { kind: 'edit'; messageId: string; original: string }

export default function ChatDetailScreen() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  return <ChatPane conversationId={conversationId ?? null} onBack={() => navigate(-1)} className="h-[100dvh]" />
}

/**
 * The conversation UI, reusable in two places: the full-screen mobile route
 * (ChatDetailScreen) and the desktop right-rail panel (ConversationRail).
 */
export function ChatPane({
  conversationId,
  onBack,
  className = 'h-[100dvh]',
}: {
  conversationId: string | null
  onBack: () => void
  className?: string
}) {
  const myId = useAuth((s) => s.session?.user.id ?? null)

  const conv = useConversation(conversationId)
  const messagesQ = useMessages(conversationId)
  const send = useSendMessage(conversationId ?? '')
  const edit = useEditMessage(conversationId ?? '')
  useChatRealtime(conversationId)
  const { theyAreTyping, notifyTyping, notifyStopped } = useTyping(conversationId)
  const otherOnline = useIsOnline(conv.data?.other_id)
  const relations = useRelations([conv.data?.other_id])
  const otherVerified = !!(conv.data?.other_id && relations.data?.get(conv.data.other_id)?.is_subscriber)

  const [actionsFor, setActionsFor] = useState<Message | null>(null)
  const [mode, setMode] = useState<ComposerMode>({ kind: 'idle' })
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Pages come newest-first. For top→bottom rendering (oldest on top,
  // newest pinned to the composer), flatten then reverse.
  const messages = useMemo<Message[]>(
    () => (messagesQ.data ? [...messagesQ.data.pages.flat()].reverse() : []),
    [messagesQ.data],
  )

  // When the in-chat search bar is open, filter the visible list. Search
  // is a substring match on message body — purely client-side over what's
  // currently cached (which scrolls back further as you load older pages).
  const visibleMessages = useMemo<Message[]>(() => {
    const term = searchText.trim().toLowerCase()
    if (!searchOpen || !term) return messages
    return messages.filter((m) =>
      (m.body ?? '').toLowerCase().includes(term),
    )
  }, [messages, searchOpen, searchText])

  // Mark this conversation read on mount and whenever new messages arrive.
  useEffect(() => {
    if (!conversationId) return
    void markConversationRead(conversationId)
  }, [conversationId, messages.length])

  // Lookup map so each reply preview can render the original message body.
  const byId = useMemo(() => {
    const m = new Map<string, Message>()
    for (const msg of messages) m.set(msg.id, msg)
    return m
  }, [messages])

  // Imperative refs to message DOM nodes — used by "jump to replied".
  const messageRefs = useRef(new Map<string, HTMLLIElement>())
  function jumpTo(id: string) {
    const el = messageRefs.current.get(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const replyTarget =
    mode.kind === 'reply' ? byId.get(mode.replyToId) ?? null : null

  return (
    /* bounded flex column so the messages list (overflow-y-auto) scrolls.
       className sets the height: h-screen on mobile, h-full in the rail. */
    <div className={`${className} flex flex-col text-ink min-h-0`}>
      <ReturnToGameBanner />
      <header
        className="shrink-0 glass border-b border-white/5 px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(var(--lm-top-inset) + 0.75rem)' }}
      >
        <button
          onClick={onBack}
          className="text-ink-2 hover:text-ink text-2xl leading-none px-1"
          aria-label="Back"
        >
          ←
        </button>
        <div className="relative shrink-0">
          <img
            src={avatarUrlOr(conv.data?.other_avatar_url)}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
          {/* Status dot — green when online, dim grey otherwise. Big enough
              to actually read at a glance; ring matches the header surface. */}
          <span
            className={[
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-surface-2',
              otherOnline ? 'bg-success' : 'bg-ink-muted',
            ].join(' ')}
            aria-label={otherOnline ? 'Online' : 'Offline'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate flex items-center gap-1">
            <span className="truncate">@{conv.data?.other_handle ?? conv.data?.other_display_name ?? '…'}</span>
            {otherVerified && <BlueTick size={15} />}
          </div>
          <div className="text-[11px] truncate">
            {theyAreTyping ? (
              <span className="text-success font-semibold">typing…</span>
            ) : otherOnline ? (
              <span className="text-success font-semibold">● Online</span>
            ) : (
              <span className="text-ink-muted">Offline</span>
            )}
          </div>
        </div>
        {conv.data?.other_id && (
          <button
            onClick={() => setChatMenuOpen(true)}
            aria-label="Chat options"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ⋯
          </button>
        )}
      </header>

      {/* In-chat search bar — toggled from the chat ⋯ menu. */}
      {searchOpen && (
        <div className="shrink-0 px-3 py-2 border-b border-white/5 bg-surface-2/80 flex items-center gap-2">
          <span className="text-ink-muted">⌕</span>
          <input
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search in this chat"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-muted"
          />
          <button
            onClick={() => { setSearchOpen(false); setSearchText('') }}
            aria-label="Close search"
            className="text-ink-muted hover:text-ink text-base px-1"
          >
            ✕
          </button>
        </div>
      )}

      <MessagesList
        messages={visibleMessages}
        status={messagesQ.status}
        myId={myId}
        byId={byId}
        messageRefs={messageRefs}
        theyAreTyping={!searchOpen && theyAreTyping}
        hasNextPage={messagesQ.hasNextPage && !searchOpen}
        isFetchingNextPage={messagesQ.isFetchingNextPage}
        fetchNextPage={messagesQ.fetchNextPage}
        onJumpToReplied={jumpTo}
        onOpenActions={setActionsFor}
      />

      <Composer
        disabled={!conversationId}
        sending={send.isPending || edit.isPending}
        error={send.error ? (send.error as Error).message : null}
        mode={mode}
        replyTarget={replyTarget}
        myId={myId}
        onCancelMode={() => setMode({ kind: 'idle' })}
        onTyping={notifyTyping}
        onFocus={() => {
          // Tap the input → snap to the newest message so the keyboard
          // doesn't cover unread context (the layout already shrinks via
          // 100dvh so the list itself remains scrollable above the keyboard).
          const el = document.querySelector<HTMLElement>('[data-chat-scroller]')
          if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
        }}
        onSubmit={async (body, media) => {
          if (mode.kind === 'edit') {
            // Edits are text-only; ignore any pending media.
            try {
              await edit.mutateAsync({ messageId: mode.messageId, body: body ?? '' })
              setMode({ kind: 'idle' })
              notifyStopped()
            } catch { /* rollback inside useEditMessage */ }
            return
          }
          try {
            await send.mutateAsync({
              body,
              media: media ?? null,
              replyTo: mode.kind === 'reply' ? mode.replyToId : null,
            })
            setMode({ kind: 'idle' })
            notifyStopped()
          } catch {
            // useSendMessage flips the optimistic row to error state.
          }
        }}
      />

      <AnimatePresence>
        {actionsFor && conversationId && (
          <MessageActionsSheet
            conversationId={conversationId}
            message={actionsFor}
            isMine={actionsFor.sender_id === myId}
            onClose={() => setActionsFor(null)}
            onReply={() => setMode({ kind: 'reply', replyToId: actionsFor.id })}
            onEdit={() =>
              setMode({
                kind: 'edit',
                messageId: actionsFor.id,
                original: actionsFor.body ?? '',
              })
            }
          />
        )}
        {chatMenuOpen && conv.data?.other_id && (
          <ChatOptionsSheet
            otherUserId={conv.data.other_id}
            otherHandle={conv.data.other_handle ?? conv.data.other_display_name}
            conversationId={conversationId ?? null}
            isPinned={!!conv.data.my_pinned_at}
            onToggleSearch={() => setSearchOpen((v) => !v)}
            onClose={() => setChatMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- MessagesList ----------

type ListProps = {
  messages: Message[]
  status: ReturnType<typeof useMessages>['status']
  myId: string | null
  byId: Map<string, Message>
  messageRefs: React.MutableRefObject<Map<string, HTMLLIElement>>
  theyAreTyping: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  onJumpToReplied: (id: string) => void
  onOpenActions: (m: Message) => void
}

const TOP_FETCH_THRESHOLD_PX = 200

function MessagesList({
  messages, status, myId, byId, messageRefs, theyAreTyping,
  hasNextPage, isFetchingNextPage, fetchNextPage,
  onJumpToReplied, onOpenActions,
}: ListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wasAtBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)
  /** When we trigger a "load older" fetch, remember which message was at
   *  the top of the viewport + its offset, so we can restore the view
   *  after the new (older) page prepends. */
  const anchorRef = useRef<{ id: string; offset: number } | null>(null)

  function recordAnchor() {
    const el = scrollRef.current
    if (!el) return
    // The first message DOM node in document order is the oldest currently
    // rendered — use its position to anchor.
    const firstLi = el.querySelector<HTMLLIElement>('[data-msg-id]')
    if (!firstLi) return
    anchorRef.current = {
      id: firstLi.dataset.msgId!,
      offset: firstLi.getBoundingClientRect().top - el.getBoundingClientRect().top,
    }
  }

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    wasAtBottomRef.current = distFromBottom < 80

    if (
      el.scrollTop < TOP_FETCH_THRESHOLD_PX &&
      hasNextPage &&
      !isFetchingNextPage &&
      !anchorRef.current
    ) {
      recordAnchor()
      fetchNextPage()
    }
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Initial: snap to the bottom on first render with any messages.
    if (!didInitialScrollRef.current && messages.length > 0) {
      el.scrollTop = el.scrollHeight
      didInitialScrollRef.current = true
      return
    }

    // Just prepended an older page — restore the user's previous view.
    if (anchorRef.current) {
      const target = el.querySelector<HTMLElement>(
        `[data-msg-id="${anchorRef.current.id}"]`,
      )
      if (target) {
        const newOffset =
          target.getBoundingClientRect().top - el.getBoundingClientRect().top
        el.scrollTop += newOffset - anchorRef.current.offset
      }
      anchorRef.current = null
      return
    }

    // A new message arrived at the bottom — follow it only if the user
    // was already parked there.
    if (wasAtBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages.length, theyAreTyping])

  return (
    <div
      ref={scrollRef}
      data-chat-scroller
      onScroll={onScroll}
      /* flex-1 + min-h-0 inside a bounded flex column = scrolls.
         no-scrollbar hides the native track on every platform. */
      className="flex-1 min-h-0 overflow-y-auto py-4 no-scrollbar"
    >
      {/* Top loader (only shown while paginating older history) */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <div className="w-6 h-6 rounded-full bg-gradient-brand glow-rose animate-pulse opacity-70" />
        </div>
      )}

      {status === 'pending' && (
        <div className="space-y-2 px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`glass h-10 rounded-2xl animate-pulse w-2/3 ${i % 2 ? 'ml-auto' : ''}`}
            />
          ))}
        </div>
      )}

      {status === 'success' && messages.length === 0 && !theyAreTyping && (
        <div className="h-full grid place-items-center">
          <div className="text-center text-ink-muted">
            <div className="text-4xl mb-2">👋</div>
            <p className="text-sm">No messages yet — break the ice.</p>
          </div>
        </div>
      )}

      <ul className="space-y-1.5 px-3">
        {messages.map((m) => {
          const mine = m.sender_id === myId
          const repliedTo = m.reply_to ? byId.get(m.reply_to) ?? null : null
          return (
            <li
              key={m.id}
              data-msg-id={m.id}
              ref={(el) => {
                if (el) messageRefs.current.set(m.id, el)
                else messageRefs.current.delete(m.id)
              }}
            >
              <ChatBubble
                message={m}
                isMine={mine}
                repliedTo={repliedTo}
                onJumpToReplied={onJumpToReplied}
                onOpenActions={() => onOpenActions(m)}
              />
            </li>
          )
        })}
        <AnimatePresence>
          {theyAreTyping && (
            <li key="typing">
              <TypingIndicatorBubble />
            </li>
          )}
        </AnimatePresence>
      </ul>
    </div>
  )
}

// ---------- Composer ----------

type ComposerProps = {
  disabled: boolean
  sending: boolean
  error: string | null
  mode: ComposerMode
  replyTarget: Message | null
  myId: string | null
  onCancelMode: () => void
  onTyping: () => void
  onFocus?: () => void
  onSubmit: (body: string | null, media: ChatMediaUpload | null) => Promise<void>
}

function Composer({
  disabled, sending, error, mode, replyTarget, myId, onCancelMode, onTyping, onFocus, onSubmit,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [pendingMedia, setPendingMedia] = useState<ChatMediaUpload | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const upload = useUploadChatMedia()

  // ---- Voice-note recording ----
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recTimerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)
  const MAX_REC_SECS = 300 // 5 minutes

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (recTimerRef.current != null) {
      window.clearInterval(recTimerRef.current)
      recTimerRef.current = null
    }
  }

  async function startRecording() {
    if (editing || disabled) return
    setUploadError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickAudioMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      cancelledRef.current = false
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stopTracks()
        setRecording(false)
        const wasCancelled = cancelledRef.current
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (wasCancelled || blob.size === 0) return
        const ext = (rec.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-note.${ext}`, { type: blob.type })
        void uploadVoice(file)
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
      setRecSecs(0)
      recTimerRef.current = window.setInterval(() => {
        setRecSecs((s) => {
          if (s + 1 >= MAX_REC_SECS) { stopRecording() ; return MAX_REC_SECS }
          return s + 1
        })
      }, 1000)
    } catch {
      stopTracks()
      setUploadError('Microphone access is needed to record a voice note.')
    }
  }

  function stopRecording() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    stopRecording()
    setRecSecs(0)
  }

  async function uploadVoice(file: File) {
    try {
      const r = await upload.mutateAsync(file)
      // Voice notes send immediately — no caption step.
      await onSubmit(null, r)
    } catch (e) {
      setUploadError((e as Error).message)
    }
  }

  // Tidy up the mic stream if the composer unmounts mid-recording.
  useEffect(() => () => stopTracks(), [])

  // Seed the textarea from the original body when switching into edit mode.
  useEffect(() => {
    if (mode.kind === 'edit') {
      setText(mode.original)
      setPendingMedia(null)        // edits are text-only
      taRef.current?.focus()
    } else if (mode.kind === 'reply') {
      taRef.current?.focus()
    }
  }, [mode])

  const trimmed = text.trim()
  const editing = mode.kind === 'edit'
  // Sendable when: editing → text non-empty; otherwise → text OR media.
  const canSend =
    !disabled &&
    !sending &&
    !upload.isPending &&
    trimmed.length <= 4000 &&
    (editing ? trimmed.length > 0 : trimmed.length > 0 || !!pendingMedia)

  // Show the mic (vs send) when there's nothing to send yet: empty text,
  // no pending attachment, not editing, not mid-upload.
  const showMic =
    !editing && trimmed.length === 0 && !pendingMedia && !upload.isPending

  // Auto-grow textarea up to ~5 lines.
  function resize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }
  useEffect(resize, [text])

  async function pickMedia(file: File | undefined) {
    if (!file || editing) return
    setUploadError(null)
    try {
      const r = await upload.mutateAsync(file)
      setPendingMedia(r)
    } catch (e) {
      setUploadError((e as Error).message)
    }
  }

  async function submit() {
    if (!canSend) return
    const body = trimmed.length > 0 ? trimmed : null
    const media = pendingMedia
    setText('')
    setPendingMedia(null)
    try {
      await onSubmit(body, editing ? null : media)
    } catch {
      // restore so the user can retry
      if (body) setText(body)
      if (media) setPendingMedia(media)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape' && mode.kind !== 'idle') {
      e.preventDefault()
      onCancelMode()
      setText('')
      setPendingMedia(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div
      className="shrink-0 glass border-t border-white/5 px-3 py-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      {error && <p className="text-xs text-danger px-2 pb-2">{error}</p>}
      {uploadError && <p className="text-xs text-danger px-2 pb-2">{uploadError}</p>}

      {/* Pending media preview (uploading or uploaded) */}
      {(upload.isPending || pendingMedia) && (
        <div className="mb-2 mx-1 flex items-center gap-3 rounded-2xl glass px-3 py-2">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 shrink-0 grid place-items-center">
            {pendingMedia?.kind === 'video' ? (
              <video src={pendingMedia.url} className="w-full h-full object-cover" muted />
            ) : pendingMedia?.kind === 'image' ? (
              <img src={pendingMedia.url} alt="" className="w-full h-full object-cover" />
            ) : pendingMedia?.kind === 'audio' ? (
              <span className="text-rose text-2xl">🎙</span>
            ) : (
              <span className="text-ink-muted text-lg animate-pulse">📎</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-ink truncate">
              {upload.isPending
                ? 'Uploading…'
                : pendingMedia?.kind === 'video' ? 'Video ready'
                : pendingMedia?.kind === 'audio' ? 'Voice note ready'
                : 'Image ready'}
            </div>
            <div className="text-[11px] text-ink-muted truncate">
              {upload.isPending ? 'Hang on a sec.' : 'Add a caption and tap send.'}
            </div>
          </div>
          {pendingMedia && (
            <button
              onClick={() => setPendingMedia(null)}
              aria-label="Remove attachment"
              className="text-ink-muted hover:text-ink text-base px-2"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Reply preview banner */}
      {mode.kind === 'reply' && (
        <div className="mb-2 mx-1 flex items-stretch gap-2 rounded-2xl glass px-3 py-2 border-l-2 border-coral">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-coral font-semibold">
              Replying to {replyTarget?.sender_id === myId ? 'yourself' : 'them'}
            </div>
            <div className="text-xs text-ink-2 truncate">
              {replyTarget?.deleted_at
                ? 'Message was deleted'
                : replyTarget?.body ?? '…'}
            </div>
          </div>
          <button
            onClick={() => { onCancelMode(); setText('') }}
            aria-label="Cancel reply"
            className="text-ink-muted hover:text-ink text-base px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Editing banner */}
      {mode.kind === 'edit' && (
        <div className="mb-2 mx-1 flex items-stretch gap-2 rounded-2xl glass px-3 py-2 border-l-2 border-gold">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gold font-semibold">Editing message</div>
            <div className="text-xs text-ink-muted">Press Esc to cancel</div>
          </div>
          <button
            onClick={() => { onCancelMode(); setText('') }}
            aria-label="Cancel edit"
            className="text-ink-muted hover:text-ink text-base px-2"
          >
            ✕
          </button>
        </div>
      )}

      {recording ? (
        /* Recording bar — replaces the input while capturing a voice note. */
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cancelRecording}
            aria-label="Cancel recording"
            className="shrink-0 w-10 h-10 grid place-items-center rounded-full glass text-ink-2 hover:text-danger transition-colors"
          >
            🗑
          </button>
          <div className="flex-1 flex items-center gap-2 glass rounded-3xl px-4 py-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-ink tabular-nums">{fmtRec(recSecs)}</span>
            <span className="text-xs text-ink-muted ml-1">Recording…</span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop and attach voice note"
            className="shrink-0 rounded-full w-11 h-11 grid place-items-center text-lg bg-gradient-brand text-white glow-rose"
          >
            ✓
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Attach button — hidden in edit mode (edits are text-only). */}
          {!editing && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || upload.isPending}
                aria-label="Attach image or video"
                className="shrink-0 w-10 h-10 grid place-items-center rounded-full glass text-ink-2 hover:text-rose transition-colors disabled:opacity-50"
              >
                <span className="text-lg leading-none">＋</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  void pickMedia(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          )}

          <div className="flex-1 glass rounded-3xl px-4 py-2 focus-within:ring-brand transition-shadow">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.length > 0 && mode.kind !== 'edit') onTyping()
              }}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                mode.kind === 'edit' ? 'Edit your message…' :
                mode.kind === 'reply' ? 'Reply…' :
                pendingMedia ? 'Add a caption (optional)' :
                'Message…'
              }
              disabled={disabled}
              className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-base resize-none leading-snug no-scrollbar"
            />
          </div>
          {showMic ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || upload.isPending}
              aria-label="Record voice note"
              className="rounded-full w-11 h-11 grid place-items-center text-lg shrink-0 glass text-ink-2 hover:text-rose transition-colors disabled:opacity-50"
            >
              🎙
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              className={[
                'rounded-full w-11 h-11 grid place-items-center text-lg shrink-0 transition-opacity',
                canSend
                  ? 'bg-gradient-brand text-white glow-rose'
                  : 'bg-surface-3 text-ink-muted',
              ].join(' ')}
              aria-label={mode.kind === 'edit' ? 'Save edit' : 'Send'}
            >
              {mode.kind === 'edit' ? '✓' : '➤'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Pick a MediaRecorder mime the browser actually supports. webm/opus on
 *  Chrome & Firefox; mp4/aac on Safari. Returns '' to let the UA default. */
function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

function fmtRec(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
