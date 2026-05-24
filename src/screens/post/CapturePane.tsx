import { useEffect, useRef, useState } from 'react'
import {
  IconImages,
  IconFlipCamera,
  IconFlash,
  IconGrid,
  IconTimer,
} from '../../components/icons'
import { MAX_VIDEO_SECONDS } from './types'

type Props = {
  onCapturePhoto: (file: File) => void
  onCaptureVideo: (file: File) => void
  onPickFromLibrary: () => void
  loading?: boolean
}

type FacingMode = 'environment' | 'user'
const TIMERS = [0, 3, 10] as const
const HOLD_MS = 280

function pickVideoMime(): string | undefined {
  const cands = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return undefined
}

/**
 * Camera with: tap shutter = photo, **press-and-hold = record video**
 * (auto-stops at 60s). Working overlay controls (flip, torch, grid,
 * self-timer). Fixed-height, never scrolls; controls stay on-screen.
 */
export default function CapturePane({
  onCapturePhoto, onCaptureVideo, onPickFromLibrary, loading,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const holdTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)
  const isRecordingRef = useRef(false)

  const [facing, setFacing] = useState<FacingMode>('environment')
  const [error, setError] = useState<string | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [grid, setGrid] = useState(false)
  const [timerIdx, setTimerIdx] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function start() {
      stopStream()
      setError(null)
      setTorchSupported(false)
      setTorchOn(false)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const track = stream.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        if (!cancelled && caps.torch) setTorchSupported(true)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (!cancelled) setHasMultipleCameras(devices.filter((d) => d.kind === 'videoinput').length > 1)
        } catch { /* not critical */ }
      } catch (e) {
        if (!cancelled) setError(friendlyCameraError(e as DOMException | Error))
      }
    }
    void start()
    return () => { cancelled = true; teardown() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  function teardown() {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current)
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current)
    if (tickRef.current) window.clearInterval(tickRef.current)
    window.removeEventListener('pointerup', onWindowPointerUp)
    micRef.current?.getTracks().forEach((t) => t.stop())
    stopStream()
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch { setTorchSupported(false) }
  }

  // ---- Photo ----
  function takePhotoWithTimer() {
    const seconds = TIMERS[timerIdx]
    if (seconds > 0) {
      let n = seconds
      setCountdown(n)
      const id = window.setInterval(() => {
        n -= 1
        if (n <= 0) { window.clearInterval(id); setCountdown(null); void capturePhoto() }
        else setCountdown(n)
      }, 1000)
    } else {
      void capturePhoto()
    }
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setSnapping(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('snap failed'))), 'image/jpeg', 0.95))
      onCapturePhoto(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSnapping(false)
    }
  }

  // ---- Video (hold to record) ----
  async function startRecording() {
    const videoTrack = streamRef.current?.getVideoTracks()[0]
    if (!videoTrack || isRecordingRef.current) return

    let recStream: MediaStream
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      micRef.current = mic
      recStream = new MediaStream([videoTrack, ...mic.getAudioTracks()])
    } catch {
      recStream = new MediaStream([videoTrack]) // mic denied — record silently
    }

    let mr: MediaRecorder
    try {
      const mime = pickVideoMime()
      mr = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined)
    } catch {
      micRef.current?.getTracks().forEach((t) => t.stop())
      micRef.current = null
      return
    }

    chunksRef.current = []
    mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
    mr.onstop = finishRecording
    recorderRef.current = mr
    isRecordingRef.current = true
    setRecording(true)
    setElapsed(0)
    mr.start()

    const startedAt = Date.now()
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 250)
    maxTimerRef.current = window.setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000)
    window.addEventListener('pointerup', onWindowPointerUp)
  }

  function stopRecording() {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current)
    if (tickRef.current) window.clearInterval(tickRef.current)
    window.removeEventListener('pointerup', onWindowPointerUp)
    try { recorderRef.current?.stop() } catch { /* already stopped */ }
  }

  function finishRecording() {
    const type = chunksRef.current[0]?.type || recorderRef.current?.mimeType || 'video/webm'
    const blob = new Blob(chunksRef.current, { type })
    const ext = type.includes('mp4') ? 'mp4' : 'webm'
    micRef.current?.getTracks().forEach((t) => t.stop())
    micRef.current = null
    setRecording(false)
    if (blob.size > 0) {
      onCaptureVideo(new File([blob], `recording-${Date.now()}.${ext}`, { type }))
    }
  }

  function onWindowPointerUp() { stopRecording() }

  // ---- Shutter press: quick tap = photo, hold = record ----
  function onShutterDown() {
    if (cameraBlocked || loading) return
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      void startRecording()
    }, HOLD_MS)
  }
  function onShutterUp() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
      if (!isRecordingRef.current) takePhotoWithTimer()
    } else if (isRecordingRef.current) {
      stopRecording()
    }
  }

  const cameraBlocked = !!error
  const timerSeconds = TIMERS[timerIdx]

  return (
    <div className="relative flex-1 min-h-0 w-full bg-black overflow-hidden flex flex-col">
      <div className="relative flex-1 grid place-items-center overflow-hidden">
        {!cameraBlocked && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="max-w-full max-h-full object-contain"
            style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
          />
        )}

        {grid && !cameraBlocked && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/15" />)}
          </div>
        )}

        {countdown != null && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-white text-7xl font-extrabold drop-shadow-lg">{countdown}</span>
          </div>
        )}

        {recording && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/55 rounded-full px-3 py-1.5"
            style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
            <span className="text-white text-sm font-bold tabular-nums">
              {fmt(elapsed)} / {fmt(MAX_VIDEO_SECONDS)}
            </span>
          </div>
        )}

        {!cameraBlocked && !recording && (
          <div
            className="absolute right-3 flex flex-col gap-2.5"
            style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            {hasMultipleCameras && (
              <CtrlIcon label="Flip camera" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
                <IconFlipCamera />
              </CtrlIcon>
            )}
            {torchSupported && (
              <CtrlIcon label={torchOn ? 'Torch off' : 'Torch on'} active={torchOn} onClick={toggleTorch}>
                <IconFlash />
              </CtrlIcon>
            )}
            <CtrlIcon label={grid ? 'Hide grid' : 'Show grid'} active={grid} onClick={() => setGrid((g) => !g)}>
              <IconGrid />
            </CtrlIcon>
            <CtrlIcon label="Self-timer" active={timerSeconds > 0} onClick={() => setTimerIdx((i) => (i + 1) % TIMERS.length)}>
              <span className="relative grid place-items-center">
                <IconTimer />
                {timerSeconds > 0 && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-extrabold bg-rose text-white rounded-full px-1 leading-tight">
                    {timerSeconds}
                  </span>
                )}
              </span>
            </CtrlIcon>
          </div>
        )}

        {cameraBlocked && (
          <div className="text-center text-ink-2 px-6 max-w-sm">
            <div className="text-5xl mb-3">📷</div>
            <p className="font-semibold text-ink">Camera unavailable</p>
            <p className="text-sm text-ink-muted mt-1">{error}</p>
            <p className="text-xs text-ink-muted mt-4">You can still pick a photo or video from your library below.</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="shrink-0 bg-black/90 backdrop-blur px-8 pt-4 flex flex-col items-center gap-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div className="w-full flex items-center justify-between">
          <button
            onClick={onPickFromLibrary}
            disabled={loading || recording}
            aria-label="Open library"
            className="w-14 h-14 rounded-2xl bg-white/8 border border-white/15 grid place-items-center text-ink-2 hover:text-rose hover:border-white/30 transition-colors disabled:opacity-40"
          >
            <IconImages />
          </button>

          <button
            onPointerDown={onShutterDown}
            onPointerUp={onShutterUp}
            onPointerCancel={onShutterUp}
            disabled={cameraBlocked || snapping || loading || countdown != null}
            aria-label="Tap for photo, hold to record video"
            className="relative w-20 h-20 rounded-full grid place-items-center disabled:opacity-40 active:scale-95 transition-transform touch-none select-none"
          >
            {recording ? (
              <>
                <span className="absolute inset-0 rounded-full ring-4 ring-danger animate-pulse" />
                <span className="absolute inset-4 rounded-md bg-danger" />
              </>
            ) : (
              <>
                <span className="absolute inset-0 rounded-full bg-white" />
                <span className="absolute inset-1.5 rounded-full bg-black" />
                <span className="absolute inset-2.5 rounded-full bg-white" />
              </>
            )}
          </button>

          <span className="w-14 h-14" aria-hidden />
        </div>
        <p className="text-[11px] text-white/50">
          {recording ? 'Release to stop' : 'Tap for photo · hold to record'}
        </p>
      </div>
    </div>
  )
}

function CtrlIcon({
  label, active, onClick, children,
}: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={[
        'w-11 h-11 rounded-full grid place-items-center backdrop-blur transition-colors',
        active ? 'bg-rose text-white' : 'bg-black/40 text-white hover:bg-black/60',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function friendlyCameraError(e: DOMException | Error): string {
  const name = (e as DOMException).name
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return "Camera permission was denied. Enable it in your browser settings, or pick from your library."
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found on this device.'
  if (name === 'NotReadableError') return 'Your camera is already in use by another app.'
  return e.message || 'Could not access the camera.'
}
