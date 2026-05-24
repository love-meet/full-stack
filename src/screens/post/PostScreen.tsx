import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { cloudinaryUpload, cloudinaryUploadLarge, cloudinaryVideoUrl } from '../../lib/cloudinary'
import { useAuth } from '../../stores/auth'
import { useCreatePost } from '../../hooks/usePostMutations'
import PickStep from './PickStep'
import EditStep from './EditStep'
import ComposeStep from './ComposeStep'
import { bakeImageToBlob } from './filters'
import { extractTrimmedClip } from './trimVideo'
import type { AspectId, CropArea, Media, Step, Trim } from './types'

export default function PostScreen() {
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  const create = useCreatePost()

  const [step, setStep] = useState<Step>('pick')
  const [media, setMedia] = useState<Media | null>(null)
  const [caption, setCaption] = useState('')
  const [hideLikeCount, setHideLikeCount] = useState(false)
  const [commentsDisabled, setCommentsDisabled] = useState(false)
  const [altText, setAltText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState<'processing' | 'uploading'>('uploading')
  const [uploadPct, setUploadPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)

  // Revoke the object URL only when the URL itself changes (new file picked)
  // or on unmount. Earlier this fired on every filter/aspect change too,
  // which killed the shared blob URL and broke the compose-step thumbnail.
  useEffect(() => {
    const url = media?.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [media?.previewUrl])

  const submitting = uploading || create.isPending

  function next() {
    setError(null)
    if (step === 'pick' && media)   { setDirection(1); setStep('edit') }
    else if (step === 'edit')       { setDirection(1); setStep('compose') }
  }
  function back() {
    setError(null)
    if (step === 'edit')           { setDirection(-1); setStep('pick') }
    else if (step === 'compose')   { setDirection(-1); setStep('edit') }
  }

  function onPickMedia(m: Media) {
    // Picking a new file? Free the previous preview before we lose the ref.
    if (media && media.previewUrl !== m.previewUrl) {
      URL.revokeObjectURL(media.previewUrl)
    }
    setMedia(m)
  }

  async function share() {
    if (!media || !session) return
    setUploading(true)
    setPhase('processing')
    setUploadPct(0)
    setError(null)
    try {
      let outAspect = media.width / media.height
      let finalUrl: string

      const folder = `lm-app/posts/${session.user.id}`

      if (media.kind === 'image') {
        const img = await loadImg(media.previewUrl)
        const blob = await bakeImageToBlob(img, {
          cssFilter: media.filter.css,
          area: media.crop,
        })
        if (media.crop) outAspect = media.crop.width / media.crop.height
        const up = await cloudinaryUpload(blob, { folder, resourceType: 'image', tags: ['post-image'] })
        if (up.width && up.height) outAspect = up.width / up.height
        finalUrl = up.url
      } else {
        // Video — only now, on Post, does anything upload. First try to
        // extract just the trimmed ≤60s segment client-side (small,
        // compressed) so we never upload the whole source. If the browser
        // can't (e.g. HEVC .mov), fall back to a chunked upload of the
        // full file + a server-side trim.
        const trim = media.trim ?? { start: 0, end: Math.min(media.duration ?? 60, 60) }
        setPhase('processing')
        const clip = await extractTrimmedClip(media.file, trim)

        setPhase('uploading')
        if (clip) {
          const up = await cloudinaryUpload(clip.blob, { folder, resourceType: 'video', tags: ['post-video'] })
          if (up.width && up.height) outAspect = up.width / up.height
          finalUrl = cloudinaryVideoUrl(up.url) // already the cropped clip; just compress + mp4
        } else {
          const up = await cloudinaryUploadLarge(
            media.file,
            { folder, resourceType: 'video', tags: ['post-video'] },
            (f) => setUploadPct(Math.round(f * 100)),
          )
          if (up.width && up.height) outAspect = up.width / up.height
          finalUrl = cloudinaryVideoUrl(up.url, trim) // trim + compress on Cloudinary
        }
      }

      await create.mutateAsync({
        kind: media.kind,
        media_url: finalUrl,
        media_aspect: outAspect,
        caption: caption.trim() || null,
        hide_like_count: hideLikeCount,
        comments_disabled: commentsDisabled,
        alt_text: altText.trim() || null,
      })

      navigate('/feed', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="h-[100dvh] flex flex-col text-ink relative overflow-hidden">
      <Header
        step={step}
        canNext={!!media}
        submitting={submitting}
        onCancel={() => navigate(-1)}
        onBack={back}
        onNext={next}
        onShare={share}
      />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-h-0 flex flex-col"
          >
            {step === 'pick' && (
              <PickStep
                media={media}
                onPick={onPickMedia}
                onChangeAspect={(a: AspectId) => media && setMedia({ ...media, aspect: a })}
                onChangeCrop={(c: CropArea) => media && setMedia({ ...media, crop: c })}
                onChangeTrim={(t: Trim) => media && setMedia({ ...media, trim: t })}
                onClear={() => {
                  if (media) URL.revokeObjectURL(media.previewUrl)
                  setMedia(null)
                }}
              />
            )}
            {step === 'edit' && media && (
              <EditStep
                media={media}
                onChangeFilter={(f) => setMedia({ ...media, filter: f })}
              />
            )}
            {step === 'compose' && media && (
              <ComposeStep
                media={media}
                caption={caption}
                onChangeCaption={setCaption}
                hideLikeCount={hideLikeCount}
                onChangeHideLikeCount={setHideLikeCount}
                commentsDisabled={commentsDisabled}
                onChangeCommentsDisabled={setCommentsDisabled}
                altText={altText}
                onChangeAltText={setAltText}
                error={error}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm">
          <div className="glass rounded-3xl p-8 text-center max-w-xs">
            <div className="lm-spinner mx-auto" role="status" aria-label="Loading" />
            <p className="mt-4 text-ink font-semibold">
              {phase === 'processing' ? 'Preparing your clip…' : 'Sharing your moment…'}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {phase === 'processing'
                ? 'Trimming & compressing'
                : uploadPct > 0 ? `Uploading ${uploadPct}%` : 'Uploading'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Header ----------

type HeaderProps = {
  step: Step
  canNext: boolean
  submitting: boolean
  onCancel: () => void
  onBack: () => void
  onNext: () => void
  onShare: () => void
}

function Header({ step, canNext, submitting, onCancel, onBack, onNext, onShare }: HeaderProps) {
  const title =
    step === 'pick' ? 'New post' :
    step === 'edit' ? 'Edit'      : 'New post'

  return (
    <header
      className="sticky top-0 z-20 glass border-b border-white/5"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="h-14 grid grid-cols-3 items-center px-2">
        <div className="justify-self-start">
          {step === 'pick' ? (
            <button
              onClick={onCancel}
              className="px-3 py-2 text-ink-2 hover:text-ink text-base font-semibold"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onBack}
              className="px-3 py-2 text-ink-2 hover:text-ink text-2xl leading-none"
              aria-label="Back"
            >
              ←
            </button>
          )}
        </div>

        <div className="justify-self-center font-extrabold text-ink">{title}</div>

        <div className="justify-self-end">
          {step !== 'compose' ? (
            <button
              onClick={onNext}
              disabled={!canNext}
              className={[
                'px-4 py-2 text-base font-semibold',
                canNext ? 'text-rose hover:text-rose/80' : 'text-ink-muted cursor-not-allowed',
              ].join(' ')}
            >
              Next
            </button>
          ) : (
            <button
              onClick={onShare}
              disabled={submitting}
              className={[
                'px-4 py-2 text-base font-semibold',
                submitting ? 'text-ink-muted cursor-wait' : 'text-rose hover:text-rose/80',
              ].join(' ')}
            >
              Share
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

// ---------- helpers ----------

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for filter.'))
    img.src = src
  })
}
