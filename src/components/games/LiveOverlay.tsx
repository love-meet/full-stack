import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LiveComment, LiveEmoji } from '../../hooks/useLiveReactions'

const QUICK_EMOJIS = ['❤️', '😍', '🔥', '👏', '😂', '🎉', '😮', '💯']
const EMOJI_TTL = 3200

/**
 * Instagram-Live-style reactions over an active game.
 *  - Viewers get the rising comment stack + an input bar to comment / like.
 *  - Players keep a clean board: comments don't overlay it; a "View comments"
 *    button opens a panel to read them (players can't comment or like).
 * Floating emoji (likes) rise for everyone. Comments persist and scroll up
 * like a live feed rather than vanishing on a timer.
 */
export default function LiveOverlay({
  mode, comments, emojis, senderName, onComment, onEmoji, removeEmoji,
}: {
  mode: 'viewer' | 'player'
  comments: LiveComment[]
  emojis: LiveEmoji[]
  senderName: string
  onComment: (name: string, text: string) => void
  onEmoji: (emoji: string) => void
  removeEmoji: (id: string) => void
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* Floating emoji — rise for everyone. */}
      <div className="absolute right-2 bottom-24 w-16 h-[55vh] overflow-hidden">
        <AnimatePresence>
          {emojis.map((e) => (
            <FloatingEmoji key={e.id} e={e} onExpire={() => removeEmoji(e.id)} />
          ))}
        </AnimatePresence>
      </div>

      {mode === 'viewer'
        ? <ViewerControls comments={comments} senderName={senderName} onComment={onComment} onEmoji={onEmoji} />
        : <PlayerComments comments={comments} />}
    </div>
  )
}

/** Viewer side: rising comments + input bar (comment, like, quick emoji). */
function ViewerControls({
  comments, senderName, onComment, onEmoji,
}: {
  comments: LiveComment[]
  senderName: string
  onComment: (name: string, text: string) => void
  onEmoji: (emoji: string) => void
}) {
  const [text, setText] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    onComment(senderName, t)
    setText('')
  }

  return (
    <>
      {/* Rising comment stack (bottom-left, over the video). Newest at the
          bottom; older ones get pushed up and clipped, like IG Live. */}
      <div className="absolute left-3 right-20 bottom-24 flex flex-col justify-end gap-1.5 max-h-[42vh] overflow-hidden">
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              className="self-start max-w-full"
            >
              <div className="inline-block rounded-2xl bg-black/45 backdrop-blur-sm px-3 py-1.5 text-sm text-white drop-shadow">
                <span className="font-bold text-gold mr-1.5">{c.name}</span>
                <span className="break-words">{c.text}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input bar — the only interactive part. */}
      <div
        className="pointer-events-auto absolute left-0 right-0 bottom-0 px-3 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        <div className="max-w-md mx-auto flex items-center gap-2">
          <form onSubmit={submit} className="flex-1 flex items-center gap-2 glass rounded-full pl-4 pr-1.5 py-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              maxLength={200}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/50"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="shrink-0 w-8 h-8 rounded-full grid place-items-center bg-gradient-brand text-white disabled:opacity-40"
              aria-label="Send comment"
            >
              ➤
            </button>
          </form>
          <button
            type="button"
            onClick={() => onEmoji('❤️')}
            className="shrink-0 w-10 h-10 rounded-full grid place-items-center glass text-xl active:scale-90 transition-transform"
            aria-label="Send heart"
          >
            ❤️
          </button>
        </div>
        <div className="max-w-md mx-auto mt-1.5 flex items-center justify-center gap-1.5">
          {QUICK_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => onEmoji(em)}
              className="w-8 h-8 rounded-full grid place-items-center text-lg active:scale-90 transition-transform hover:bg-white/10"
              aria-label={`Send ${em}`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** Player side: a "View comments" button that opens a read-only panel, so the
 *  board stays uncluttered while playing. */
function PlayerComments({ comments }: { comments: LiveComment[] }) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the panel pinned to the newest comment.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [comments, open])

  return (
    <>
      <div className="pointer-events-auto absolute right-3 bottom-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full px-4 py-2 glass text-sm font-bold text-ink flex items-center gap-2 shadow-lg"
        >
          💬 Comments
          {comments.length > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-gradient-brand text-white text-[11px] grid place-items-center">
              {comments.length}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[60vh] glass rounded-t-3xl border-t border-white/10 flex flex-col"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-sm font-extrabold text-ink">Live comments</h3>
              <button onClick={() => setOpen(false)} className="text-xs font-bold text-ink-muted hover:text-ink">Close</button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
              {comments.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-8">No comments yet — viewers' comments show up here.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <span className="font-bold text-gold mr-1.5">{c.name}</span>
                    <span className="text-ink break-words">{c.text}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function FloatingEmoji({ e, onExpire }: { e: LiveEmoji; onExpire: () => void }) {
  const [drift] = useState(() => (Math.random() - 0.5) * 48)
  const [size] = useState(() => 22 + Math.random() * 16)
  const [startX] = useState(() => Math.random() * 24)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    timer.current = window.setTimeout(onExpire, EMOJI_TTL)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, x: startX, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], y: '-52vh', x: startX + drift, scale: 1 }}
      transition={{ duration: EMOJI_TTL / 1000, ease: 'easeOut', opacity: { times: [0, 0.1, 0.7, 1] } }}
      className="absolute bottom-0"
      style={{ fontSize: size }}
    >
      {e.emoji}
    </motion.div>
  )
}
