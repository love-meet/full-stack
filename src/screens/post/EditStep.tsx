import { useEffect, useRef, useState } from 'react'
import { FILTERS } from './filters'
import CroppedImage from './CroppedImage'
import type { Media, Trim } from './types'

type Props = {
  media: Media
  onChangeFilter: (f: Media['filter']) => void
}

export default function EditStep({ media, onChangeFilter }: Props) {
  const isImage = media.kind === 'image'

  // Video: show ONLY the cropped segment chosen in the previous phase.
  if (!isImage) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
          <TrimmedVideoPreview src={media.previewUrl} trim={media.trim} />
        </div>
        <div className="shrink-0 border-t border-white/5 px-5 py-3 text-xs text-ink-muted">
          This is the {media.trim ? `${(media.trim.end - media.trim.start).toFixed(0)}s` : ''} clip that will be posted. Filters for video are coming soon.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar">
      {/* Full preview with selected filter + current crop */}
      <div className="relative flex-1 bg-black grid place-items-center overflow-hidden min-h-[40vh] p-2">
        <CroppedImage
          src={media.previewUrl}
          naturalWidth={media.width}
          naturalHeight={media.height}
          area={media.crop}
          filter={media.filter.css === 'none' ? undefined : media.filter.css}
          // Drive height only — aspectRatio + maxWidth derive width.
          style={{ height: '60vh', maxWidth: '100%' }}
        />
      </div>

      {/* Filter strip */}
      <div className="border-t border-white/5">
        <div className="px-4 pt-3 text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Filter
        </div>
        <div className="overflow-x-auto px-4 pb-5 pt-3">
          <ul className="flex gap-3 w-max">
            {FILTERS.map((f) => {
              const active = f.id === media.filter.id
              return (
                <li key={f.id}>
                  <button
                    onClick={() => onChangeFilter(f)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={[
                        'block w-16 h-16 rounded-xl overflow-hidden ring-2 transition-all',
                        active ? 'ring-rose' : 'ring-transparent hover:ring-white/20',
                      ].join(' ')}
                    >
                      <CroppedImage
                        src={media.previewUrl}
                        naturalWidth={media.width}
                        naturalHeight={media.height}
                        area={media.crop}
                        filter={f.css === 'none' ? undefined : f.css}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </span>
                    <span
                      className={[
                        'text-[11px] font-semibold',
                        active ? 'text-rose' : 'text-ink-2',
                      ].join(' ')}
                    >
                      {f.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** Loops playback within the trimmed [start,end] window so the user sees
 *  exactly the clip that will be posted. Full frame, contained. */
function TrimmedVideoPreview({ src, trim }: { src: string; trim: Trim | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)
  const start = trim?.start ?? 0
  const end = trim?.end ?? Infinity

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const onLoaded = () => { try { v.currentTime = start } catch { /* ignore */ } }
    const onTime = () => {
      if (v.currentTime >= end || v.currentTime < start - 0.3) v.currentTime = start
    }
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('timeupdate', onTime)
    if (v.readyState >= 1) onLoaded()
    // Play with sound by default; fall back to muted if the browser blocks it.
    v.muted = false
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}) })
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [start, end])

  function toggleMute() {
    const v = ref.current
    if (!v) return
    const next = !muted
    v.muted = next
    setMuted(next)
    if (!next) v.play().catch(() => {})
  }

  return (
    <>
      <video
        ref={ref}
        src={src}
        className="absolute inset-0 w-full h-full object-contain"
        muted={muted}
        loop
        playsInline
      />
      <button
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-3 left-3 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur grid place-items-center text-white text-lg"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </>
  )
}
