import { useCallback, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import CapturePane from './CapturePane'
import VideoTrim from './VideoTrim'
import { NORMAL } from './filters'
import { ASPECTS, effectiveRatio, MAX_VIDEO_SECONDS, type AspectId, type CropArea, type Media, type Trim } from './types'

const MAX_IMAGE_BYTES = 12 * 1024 * 1024 // 12 MB

type Props = {
  media: Media | null
  onPick: (m: Media) => void
  onChangeAspect: (a: AspectId) => void
  onChangeCrop: (c: CropArea) => void
  onChangeTrim: (t: Trim) => void
  onClear: () => void
}

export default function PickStep({
  media,
  onPick,
  onChangeAspect,
  onChangeCrop,
  onChangeTrim,
  onClear,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  function resetCropperState() {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  const onCropComplete = useCallback(
    (_: Area, areaPixels: Area) => {
      onChangeCrop({
        x: areaPixels.x,
        y: areaPixels.y,
        width: areaPixels.width,
        height: areaPixels.height,
      })
    },
    [onChangeCrop],
  )

  async function handleFile(file: File) {
    setError(null)
    setLoading(true)
    try {
      // Nothing uploads here — selecting just previews locally. The video
      // is pushed to Cloudinary only on Post (and only the trimmed clip).
      const m = await fileToMedia(file)
      onPick(m)
      resetCropperState()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const naturalRatio = media ? media.width / media.height : 1
  const aspectRatio = media ? effectiveRatio(media.aspect, naturalRatio) : 1

  // ---------- Pre-pick state: camera + library ----------

  if (!media) {
    return (
      <>
        <CapturePane
          onCapturePhoto={handleFile}
          onCaptureVideo={handleFile}
          onPickFromLibrary={() => fileRef.current?.click()}
          loading={loading}
        />
        {error && <p className="text-sm text-danger px-5 py-2 bg-black/90">{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
      </>
    )
  }

  // ---------- Post-pick state: Cropper (image) or video preview ----------

  // Video gets the trim UI instead of the cropper.
  if (media.kind === 'short_video') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative flex-1 min-h-0 flex flex-col">
          <VideoTrim
            previewUrl={media.previewUrl}
            duration={media.duration}
            trim={media.trim}
            onChange={onChangeTrim}
          />
          <button
            onClick={onClear}
            className="absolute top-3 right-3 glass w-9 h-9 rounded-full grid place-items-center text-ink-2 hover:text-rose z-10"
            aria-label="Remove and pick another"
          >
            ×
          </button>
        </div>
        {error && <p className="shrink-0 text-sm text-danger px-5 pb-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar">
      <div className="relative flex-1 bg-black overflow-hidden min-h-[50vh]">
        <Cropper
          image={media.previewUrl}
          crop={pan}
          zoom={zoom}
          minZoom={1}
          maxZoom={4}
          aspect={aspectRatio}
          onCropChange={setPan}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={true}
          objectFit="contain"
        />

        <button
          onClick={onClear}
          className="absolute top-3 right-3 glass w-9 h-9 rounded-full grid place-items-center text-ink-2 hover:text-rose z-10"
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      {media.kind === 'image' && (
        <div className="border-t border-white/5 px-4 pt-3 pb-2 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2">
              Aspect
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ASPECTS.map((a) => {
                const active = media.aspect === a.id
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      onChangeAspect(a.id)
                      resetCropperState()
                    }}
                    className={[
                      'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
                      active
                        ? 'bg-gradient-brand text-white glow-rose'
                        : 'glass text-ink-2 hover:text-ink',
                    ].join(' ')}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-rose"
            />
            <span className="text-[11px] text-ink-muted w-10 text-right tabular-nums">
              {zoom.toFixed(1)}×
            </span>
          </div>

          <p className="text-[11px] text-ink-muted">
            Drag to position · pinch or scroll to zoom
          </p>
        </div>
      )}

      <div className="px-5 py-3 flex items-center justify-between border-t border-white/5">
        <div className="text-xs uppercase tracking-[0.18em] text-ink-muted">Selected</div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="text-sm font-semibold text-ink-2 hover:text-rose transition-colors"
        >
          Change
        </button>
      </div>

      {error && <p className="text-sm text-danger px-5 pb-3">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          if (fileRef.current) fileRef.current.value = ''
        }}
      />
    </div>
  )

  // ---------- inline helper ----------

  async function fileToMedia(file: File): Promise<Media> {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (!isVideo && !isImage) throw new Error('Pick an image or video.')

    // No video size cap — a long source is fine; on Post we extract just the
    // trimmed ≤60s clip (compressed), so only that small part is uploaded.
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      )
    }

    const previewUrl = URL.createObjectURL(file)

    if (isImage) {
      const dim = await readImageSize(previewUrl)
      return {
        file,
        previewUrl,
        kind: 'image',
        width: dim.w,
        height: dim.h,
        duration: null,
        filter: NORMAL,
        aspect: '4:5',
        crop: null,
        trim: null,
      }
    } else {
      // Longer videos are allowed now — the trim step caps the posted
      // segment to 60s. Duration may be non-finite for recorded WebM; the
      // trim UI resolves it from the element.
      const v = await readVideoMeta(previewUrl)
      const dur = Number.isFinite(v.duration) ? v.duration : null
      return {
        file,
        previewUrl,
        kind: 'short_video',
        width: v.w,
        height: v.h,
        duration: dur,
        filter: NORMAL,
        aspect: 'original',
        crop: null,
        trim: dur ? { start: 0, end: Math.min(dur, MAX_VIDEO_SECONDS) } : null,
      }
    }
  }
}

function readImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read image.'))
    img.src = src
  })
}

/**
 * Best-effort video metadata. Never rejects — some containers/codecs
 * (e.g. .mov / HEVC outside Safari) won't fire `loadedmetadata`, but we
 * still want to accept the file and let the trim step + Cloudinary sort
 * out dimensions. Falls back to a portrait default after a short timeout.
 */
function readVideoMeta(src: string): Promise<{ w: number; h: number; duration: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    let done = false
    const finish = (w: number, h: number, duration: number) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      resolve({ w, h, duration })
    }
    v.onloadedmetadata = () => finish(v.videoWidth || 720, v.videoHeight || 1280, v.duration)
    v.onerror = () => finish(720, 1280, NaN)
    const timer = window.setTimeout(() => finish(720, 1280, NaN), 4000)
    v.src = src
  })
}
