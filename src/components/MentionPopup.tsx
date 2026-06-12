import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type MentionResult } from '../hooks/useMentionSearch'
import { avatarUrlOr } from '../lib/avatar'

export default function MentionPopup({
  query,
  results,
  loading,
  onSelect,
  onDismiss,
  anchorRect,
}: {
  query: string
  results: MentionResult[]
  loading: boolean
  onSelect: (handle: string) => void
  onDismiss: () => void
  anchorRect: DOMRect | null
}) {
  const selectedIndex = useRef(0)

  useEffect(() => {
    selectedIndex.current = 0
  }, [query, results])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectedIndex.current = (selectedIndex.current + 1) % results.length
        // force re-render (hacky but okay for this small list)
        document.getElementById(`mention-${selectedIndex.current}`)?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectedIndex.current = (selectedIndex.current - 1 + results.length) % results.length
        document.getElementById(`mention-${selectedIndex.current}`)?.focus()
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (results.length > 0) {
          e.preventDefault()
          onSelect(results[selectedIndex.current].handle!)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, onSelect, onDismiss])

  if (!anchorRect || (results.length === 0 && !loading)) return null

  // Position above the text input, aligned left to the cursor (roughly)
  const top = anchorRect.top - 8 // spacing
  const left = Math.min(anchorRect.left, window.innerWidth - 240) // prevent clipping right edge

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 pointer-events-auto" onClick={onDismiss} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed z-50 w-[220px] bg-surface-2/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl overflow-hidden pointer-events-auto flex flex-col"
        style={{
          top: top,
          left: left,
          transform: 'translateY(-100%)', // align bottom edge to top coordinate
        }}
      >
        <div className="px-3 py-1.5 bg-black/20 border-b border-white/5 text-[10px] font-bold text-ink-muted uppercase tracking-wider">
          {loading ? 'Searching...' : 'Mentions'}
        </div>
        <ul className="max-h-[200px] overflow-y-auto no-scrollbar py-1">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                id={`mention-${i}`}
                onClick={(e) => { e.stopPropagation(); onSelect(r.handle!) }}
                onFocus={() => { selectedIndex.current = i }}
                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/5 focus:bg-brand/20 outline-none transition-colors text-left"
              >
                <img src={avatarUrlOr(r.avatar_url)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-sm font-bold text-ink truncate">@{r.handle}</div>
                  {r.display_name && <div className="text-[11px] text-ink-muted truncate">{r.display_name}</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  )
}
