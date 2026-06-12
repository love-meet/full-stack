import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAudioTracks, type AudioTrack } from '../hooks/useAudioTracks'
import { IconSearch } from './icons'

export default function MusicPickerSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (track: AudioTrack) => void
}) {
  const tracksQ = useAudioTracks()
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stop playing when the sheet closes
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause()
      setPlayingId(null)
    }
  }, [open])

  const results = useMemo(() => {
    const all = tracksQ.data ?? []
    const term = search.trim().toLowerCase()
    if (!term) return all
    return all.filter((t) => t.title.toLowerCase().includes(term) || t.artist.toLowerCase().includes(term))
  }, [tracksQ.data, search])

  function togglePlay(track: AudioTrack) {
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.audio_url
        audioRef.current.play().catch(() => {})
      } else {
        const a = new Audio(track.audio_url)
        a.addEventListener('ended', () => setPlayingId(null))
        a.play().catch(() => {})
        audioRef.current = a
      }
      setPlayingId(track.id)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative bg-surface/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 flex flex-col max-h-[80vh] min-h-[50vh]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            <div className="shrink-0 flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>
            
            <div className="shrink-0 px-4 pb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Add music</h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink w-8 h-8 flex justify-center items-center rounded-full bg-white/5">✕</button>
            </div>

            <div className="shrink-0 px-4 pb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  <IconSearch size={18} />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tracks or artists..."
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 no-scrollbar">
              {tracksQ.status === 'pending' && (
                <div className="py-10 text-center text-ink-muted text-sm flex flex-col items-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-brand animate-spin" />
                  Loading library...
                </div>
              )}
              {tracksQ.status === 'success' && results.length === 0 && (
                <div className="py-10 text-center text-ink-muted text-sm">
                  No tracks found.
                </div>
              )}
              {results.map((t) => {
                const isPlaying = playingId === t.id
                return (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 group transition-colors">
                    <button onClick={() => togglePlay(t)} className="relative shrink-0 w-12 h-12 rounded-lg bg-surface-3 overflow-hidden grid place-items-center cursor-pointer mr-3 group-hover:ring-2 group-hover:ring-brand/50 transition-all">
                      {t.cover_url ? (
                        <img src={t.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                      ) : (
                        <span className="absolute inset-0 bg-gradient-to-br from-surface-3 to-surface flex items-center justify-center text-xl opacity-60">🎵</span>
                      )}
                      <div className="relative z-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white drop-shadow">
                        {isPlaying ? <span className="w-2.5 h-2.5 bg-brand rounded-sm animate-pulse" /> : '▶'}
                      </div>
                    </button>
                    
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(t)}>
                      <h3 className="text-[15px] font-bold text-ink truncate group-hover:text-brand transition-colors">{t.title}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-ink-muted truncate">
                        <span>{t.artist}</span>
                        {t.duration_sec && (
                          <>
                            <span>·</span>
                            <span>{Math.floor(t.duration_sec / 60)}:{(t.duration_sec % 60).toString().padStart(2, '0')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
