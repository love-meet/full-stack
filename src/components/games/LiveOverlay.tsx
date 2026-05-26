import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LiveComment, LiveEmoji } from '../../hooks/useLiveReactions'

const QUICK_EMOJIS = ['❤️', '😍', '🔥', '👏', '😂', '🎉', '😮', '💯']
const COMMENT_TTL = 6500
const EMOJI_TTL = 3200

/**
 * Instagram-Live-style overlay: comments stack and rise from the bottom-left
 * (fading as they age) and tapped emoji float up the right side. A bottom input
 * bar lets viewers and players send comments + emoji. Pointer events pass
 * through everywhere except the input bar, so the game stays interactive.
 */
export default function LiveOverlay({
  comments, emojis, senderName, onComment, onEmoji, removeComment, removeEmoji,
}: {
  comments: LiveComment[]
  emojis: LiveEmoji[]
  senderName: string
  onComment: (name: string, text: string) => void
  onEmoji: (emoji: string) => void
  removeComment: (id: string) => void
  removeEmoji: (id: string) => void
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
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* Rising comment stack (bottom-left). */}
      <div className="absolute left-3 right-20 bottom-20 flex flex-col justify-end gap-1.5 max-h-[45vh] overflow-hidden">
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <CommentBubble key={c.id} c={c} onExpire={() => removeComment(c.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Floating emoji (bottom-right). */}
      <div className="absolute right-2 bottom-20 w-16 h-[55vh] overflow-hidden">
        <AnimatePresence>
          {emojis.map((e) => (
            <FloatingEmoji key={e.id} e={e} onExpire={() => removeEmoji(e.id)} />
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
              placeholder="Say something…"
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
        {/* Quick emoji row */}
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
    </div>
  )
}

function CommentBubble({ c, onExpire }: { c: LiveComment; onExpire: () => void }) {
  const timer = useRef<number | null>(null)
  useEffect(() => {
    timer.current = window.setTimeout(onExpire, COMMENT_TTL)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className="self-start max-w-full"
    >
      <div className="inline-block rounded-2xl bg-black/45 backdrop-blur-sm px-3 py-1.5 text-sm text-white drop-shadow">
        <span className="font-bold text-gold mr-1.5">{c.name}</span>
        <span className="break-words">{c.text}</span>
      </div>
    </motion.div>
  )
}

function FloatingEmoji({ e, onExpire }: { e: LiveEmoji; onExpire: () => void }) {
  // Randomised drift + size so a burst of hearts looks lively, not uniform.
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
