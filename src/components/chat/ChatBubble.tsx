import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Message } from '../../hooks/useMessages'
import { cloudinaryPlaceholderUrl } from '../../lib/cloudinary'
import { Linkify } from '../../lib/linkify'
import GameInviteCard, { playCodeFromText } from './GameInviteCard'

type Props = {
  message: Message
  isMine: boolean
  /** The message this one replies to, looked up by parent list. May be undefined if not in cache. */
  repliedTo?: Message | null
  /** Tap the quoted preview to scroll to that message. */
  onJumpToReplied?: (messageId: string) => void
  /** Long-press / right-click → open the action sheet. */
  onOpenActions: () => void
}

const LONG_PRESS_MS = 450

export default function ChatBubble({
  message, isMine, repliedTo, onJumpToReplied, onOpenActions,
}: Props) {
  const pressTimer = useRef<number | null>(null)
  const isLongPressing = useRef(false)

  function startPress() {
    cancelPress()
    isLongPressing.current = false
    pressTimer.current = window.setTimeout(() => {
      isLongPressing.current = true
      onOpenActions()
    }, LONG_PRESS_MS)
  }
  function cancelPress() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const deleted = message.deleted_at != null
  const edited = message.edited_at != null && !deleted
  const time = formatTime(message.created_at)

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-1`}
    >
      <div
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => { e.preventDefault(); onOpenActions() }}
        className={[
          'relative max-w-[78%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words shadow-sm select-text',
          isMine
            ? 'bg-gradient-brand text-white rounded-br-md'
            : 'glass text-ink rounded-bl-md',
          message.pending ? 'opacity-70' : '',
          message.error ? 'ring-1 ring-danger' : '',
        ].join(' ')}
      >
        {/* Quoted reply preview (cyan left border + truncated body) */}
        {message.reply_to && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (message.reply_to && onJumpToReplied) onJumpToReplied(message.reply_to)
            }}
            className={[
              'block w-full text-left mb-1.5 pl-2 border-l-2 border-coral rounded-sm py-0.5',
              isMine ? 'text-white/85' : 'text-ink-2',
            ].join(' ')}
          >
            <div className="text-[11px] font-semibold opacity-90">
              {repliedTo?.sender_id === message.sender_id ? 'You' : 'Reply'}
            </div>
            <div className="text-[12px] line-clamp-2 opacity-85">
              {repliedTo
                ? repliedTo.deleted_at
                  ? 'Message was deleted'
                  : repliedTo.body ?? ''
                : 'Original message'}
            </div>
          </button>
        )}

        {deleted ? (
          <div className="flex items-center gap-2 italic opacity-80">
            <span aria-hidden>⊘</span>
            <span>This message was deleted</span>
          </div>
        ) : (
          <>
            {message.media_url && message.media_kind === 'audio' ? (
              <VoiceNote url={message.media_url} isMine={isMine} pending={!!message.pending} />
            ) : message.media_url ? (
              <MediaBlock
                url={message.media_url}
                kind={message.media_kind}
                aspect={message.media_aspect}
                hasCaption={!!message.body}
                pending={!!message.pending}
              />
            ) : null}
            {message.body && (() => {
              const code = playCodeFromText(message.body)
              return code
                ? <GameInviteCard code={code} />
                : <span><Linkify text={message.body} /></span>
            })()}
          </>
        )}

        {/* Footer: edited flag + time + status tick */}
        <div
          className={[
            'mt-1 flex items-center justify-end gap-1.5 text-[10px]',
            isMine ? 'text-white/75' : 'text-ink-muted',
          ].join(' ')}
        >
          {edited && <span className="italic">edited</span>}
          <span>{time}</span>
          {isMine && <StatusTick message={message} />}
        </div>
      </div>
    </motion.li>
  )
}

function MediaBlock({
  url, kind, aspect, hasCaption, pending,
}: {
  url: string
  kind: Message['media_kind']
  aspect: number | null
  hasCaption: boolean
  pending: boolean
}) {
  // Clamp aspect so a portrait video doesn't take the whole viewport.
  const a = aspect && aspect > 0 ? Math.max(0.5, Math.min(aspect, 2.5)) : 1
  const mediaKind: 'image' | 'video' = kind === 'video' ? 'video' : 'image'
  const placeholder = cloudinaryPlaceholderUrl(url, mediaKind)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl bg-black/30 -mx-1 mb-1.5',
        hasCaption ? '' : '-mb-1',
      ].join(' ')}
      style={{ aspectRatio: String(a), maxWidth: '320px' }}
    >
      {/* Blurred placeholder — sits underneath while the real asset loads.
          We deliberately upscale + blur a tiny 60px Cloudinary thumbnail so
          a few KB give the recipient an instant "something is coming"
          impression. */}
      {placeholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-md"
        />
      )}

      {/* The real media. Opacity transitions from 0 to 1 the moment its
          first frame / pixels are decoded by the browser. */}
      {mediaKind === 'video' ? (
        <video
          src={url}
          onLoadedData={() => setLoaded(true)}
          onError={() => setErrored(true)}
          playsInline
          controls
          preload="metadata"
          className={[
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      ) : (
        <img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={[
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      )}

      {/* Spinner overlay while the real asset is still streaming in.
          Also shown briefly during the sender's optimistic-pending window. */}
      {(!loaded || pending) && !errored && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="w-9 h-9 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      )}

      {errored && (
        <div className="absolute inset-0 grid place-items-center text-white/80 text-xs px-4 text-center pointer-events-none">
          <div>
            <div className="text-2xl mb-1">⚠</div>
            <div>Couldn't load this {mediaKind}.</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact voice-note player: play/pause + scrubber + elapsed time.
 *  A custom UI (rather than <audio controls>) keeps it on-palette, hides
 *  the native download menu, and fits the chat bubble. */
function VoiceNote({ url, isMine, pending }: { url: string; isMine: boolean; pending: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(0)

  function toggle() {
    const a = ref.current
    if (!a) return
    if (a.paused) { void a.play(); setPlaying(true) }
    else { a.pause(); setPlaying(false) }
  }

  function onLoaded() {
    const d = ref.current?.duration
    if (d && isFinite(d)) setDur(d)
  }
  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = ref.current
    if (!a || !dur) return
    a.currentTime = Number(e.target.value)
    setCur(a.currentTime)
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0
  const accent = isMine ? 'accent-white' : 'accent-rose'

  return (
    <div className={['flex items-center gap-2.5 py-1 pr-1 min-w-[180px]', pending ? 'opacity-70' : ''].join(' ')}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle() }}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={[
          'shrink-0 w-9 h-9 rounded-full grid place-items-center text-base',
          isMine ? 'bg-white/20 text-white' : 'bg-rose/20 text-rose',
        ].join(' ')}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.01}
          value={cur}
          onChange={seek}
          onClick={(e) => e.stopPropagation()}
          aria-label="Seek"
          className={['w-full h-1.5 cursor-pointer', accent].join(' ')}
        />
        <div className={['mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums', isMine ? 'text-white/75' : 'text-ink-muted'].join(' ')}>
          <span aria-hidden>🎙</span>
          <span>{fmtClock(cur)} / {fmtClock(dur)}</span>
          <span className="sr-only">{Math.round(pct)}%</span>
        </div>
      </div>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onDurationChange={onLoaded}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onEnded={() => { setPlaying(false); setCur(0) }}
        controlsList="nodownload"
        className="hidden"
      />
    </div>
  )
}

function fmtClock(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function StatusTick({ message }: { message: Message }) {
  if (message.error) {
    return <span className="text-danger" aria-label="failed to send">!</span>
  }
  if (message.pending) {
    return <span aria-label="sending">⏱</span>
  }
  const seenByOther = (message.read_by ?? []).some((id) => id !== message.sender_id)
  if (seenByOther) {
    return <span aria-label="read">✓✓</span>
  }
  return <span aria-label="sent">✓</span>
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
