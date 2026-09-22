import { useEffect, useRef, useState } from 'react'
import { MAX_VIDEO_SECONDS, type Trim } from './types'

type Props = {
  previewUrl: string
  /** Known duration (seconds) or null when unknown (e.g. recorded WebM). */
  duration: number | null
  trim: Trim | null
  onChange: (t: Trim) => void
}

type DragMode = 'start' | 'end' | 'move' | null

/**
 * Trim a video to a ≤60s segment. The whole frame is shown (object-contain,
 * shrinks to fit) so nothing is cut off. On the timeline you can drag either
 * handle to resize, or grab the middle band to slide the 60s window anywhere
 * in the clip. The preview loops the selected window.
 */
export default function VideoTrim({ previewUrl, duration, trim, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [dur, setDur] = useState<number>(duration && isFinite(duration) ? duration : 0)
  const [drag, setDrag] = useState<DragMode>(null)
  const [muted, setMuted] = useState(false)
  // For 'move': pointer offset within the window + the window length at grab.
  const moveRef = useRef({ grabOffset: 0, len: 0 })

  const start = trim?.start ?? 0
  const end = trim?.end ?? Math.min(dur || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS)

  // Resolve duration once metadata loads. WebM recordings often report
  // Infinity until you seek past the end, so we do the seek-trick.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    function onMeta() {
      const d = v!.duration
      if (isFinite(d) && d > 0) {
        setDur(d)
      } else {
        const onSeeked = () => {
          if (isFinite(v!.duration)) { setDur(v!.duration); v!.currentTime = 0 }
          v!.removeEventListener('seeked', onSeeked)
        }
        v!.addEventListener('seeked', onSeeked)
        try { v!.currentTime = 1e7 } catch { /* ignore */ }
      }
    }
    v.addEventListener('loadedmetadata', onMeta)
    if (v.readyState >= 1) onMeta()
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [previewUrl])

  // Once we know the duration, seed/clamp the trim window to ≤ 60s.
  useEffect(() => {
    if (!dur) return
    if (!trim) {
      onChange({ start: 0, end: Math.min(dur, MAX_VIDEO_SECONDS) })
    } else if (trim.end > dur) {
      onChange({ start: Math.min(trim.start, dur), end: Math.min(dur, MAX_VIDEO_SECONDS) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur])

  // Loop playback within the selected window.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !dur) return
    function onTime() {
      if (v!.currentTime >= end) v!.currentTime = start
      else if (v!.currentTime < start - 0.3) v!.currentTime = start
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [start, end, dur])

  // Play with sound by default; if the browser blocks unmuted autoplay,
  // fall back to muted playback (the toggle lets the user turn sound on).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.play().catch(() => {
      v.muted = true
      setMuted(true)
      v.play().catch(() => {})
    })
  }, [previewUrl])

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    const next = !muted
    v.muted = next
    setMuted(next)
    if (!next) v.play().catch(() => {})
  }

  function posToTime(clientX: number): number {
    const bar = barRef.current
    if (!bar || !dur) return 0
    const r = bar.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return pct * dur
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !dur) return
    const t = posToTime(e.clientX)
    if (drag === 'start') {
      const s = Math.min(t, end - 0.5)
      const clamped = Math.max(0, Math.max(s, end - MAX_VIDEO_SECONDS))
      onChange({ start: clamped, end })
      seekPreview(clamped)
    } else if (drag === 'end') {
      const en = Math.max(t, start + 0.5)
      const clamped = Math.min(dur, Math.min(en, start + MAX_VIDEO_SECONDS))
      onChange({ start, end: clamped })
      seekPreview(Math.max(start, clamped - 0.4))
    } else {
      // move: slide the whole window, keeping its length.
      const { grabOffset, len } = moveRef.current
      let newStart = t - grabOffset
      newStart = Math.max(0, Math.min(newStart, dur - len))
      onChange({ start: newStart, end: newStart + len })
      seekPreview(newStart)
    }
  }

  function seekPreview(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t
  }

  useEffect(() => {
    if (!drag) return
    function up() { setDrag(null) }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, start, end, dur])

  function startMove(e: React.PointerEvent) {
    e.preventDefault()
    const t = posToTime(e.clientX)
    moveRef.current = { grabOffset: t - start, len: end - start }
    setDrag('move')
  }

  const leftPct = dur ? (start / dur) * 100 : 0
  const widthPct = dur ? ((end - start) / dur) * 100 : 100
  const selSeconds = Math.max(0, end - start)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Video — the ENTIRE frame is always visible, scaled down to fit
          (object-contain). Pinned with absolute inset-0 so its box exactly
          matches the container regardless of flex height quirks — it can
          never overflow/clip. On a short screen it just gets smaller. */}
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        <video
          ref={videoRef}
          src={previewUrl}
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
      </div>

      {/* Controls */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between text-[11px] text-ink-muted mb-2">
          <span className="uppercase tracking-[0.18em]">Trim · max {MAX_VIDEO_SECONDS}s</span>
          <span className={selSeconds > MAX_VIDEO_SECONDS + 0.05 ? 'text-danger font-bold' : 'text-ink-2 font-semibold'}>
            {selSeconds.toFixed(1)}s selected
          </span>
        </div>

        {/* Timeline */}
        <div ref={barRef} className="relative h-12 rounded-xl bg-surface-3 overflow-hidden select-none touch-none">
          {/* selected window — grab to slide */}
          <div
            onPointerDown={startMove}
            className="absolute top-0 bottom-0 bg-rose/25 border-y-2 border-rose cursor-grab active:cursor-grabbing"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            <span className="absolute inset-0 grid place-items-center text-white/70 text-base pointer-events-none">⠿</span>
          </div>
          {/* start handle */}
          <button
            aria-label="Trim start"
            onPointerDown={(e) => { e.preventDefault(); setDrag('start') }}
            className="absolute top-0 bottom-0 w-4 -ml-2 rounded-l-xl bg-rose grid place-items-center cursor-ew-resize touch-none z-10"
            style={{ left: `${leftPct}%` }}
          >
            <span className="w-0.5 h-5 bg-white/90 rounded" />
          </button>
          {/* end handle */}
          <button
            aria-label="Trim end"
            onPointerDown={(e) => { e.preventDefault(); setDrag('end') }}
            className="absolute top-0 bottom-0 w-4 -ml-2 rounded-r-xl bg-rose grid place-items-center cursor-ew-resize touch-none z-10"
            style={{ left: `${leftPct + widthPct}%` }}
          >
            <span className="w-0.5 h-5 bg-white/90 rounded" />
          </button>
        </div>

        <p className="text-[11px] text-ink-muted mt-2">
          Drag the ends to resize · drag the middle to slide the window.
        </p>
      </div>
    </div>
  )
}
