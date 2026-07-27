import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUploadGalleryPhoto } from '../hooks/useUploadGalleryPhoto'
import { GALLERY_SIZE } from '../screens/onboarding/types'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
}

/**
 * Fixed-slot gallery editor. Same shape as onboarding's GalleryStep, but for
 * an existing profile: these photos are what the gallery feed shows other
 * users, so they have to stay editable for the life of the account (before
 * this, gallery_urls was written once at onboarding and could never change).
 *
 * Slots compact on change — the stored array never has gaps, which keeps
 * `array_length(gallery_urls, 1)` meaningful for the feed's "has photos"
 * filter in get_gallery_feed().
 */
export default function GalleryEditor({ value, onChange }: Props) {
  const { t } = useTranslation()
  const upload = useUploadGalleryPhoto()
  const fileRefs = useRef<Array<HTMLInputElement | null>>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)

  // Normalize to a fixed length so every slot renders, filled or not.
  const slots = Array.from({ length: GALLERY_SIZE }, (_, i) => value[i] ?? '')
  const filled = slots.filter(Boolean).length

  async function onFile(index: number, file: File) {
    setError(null)
    setPendingIndex(index)
    try {
      const url = await upload.mutateAsync(file)
      const next = [...slots]
      next[index] = url
      onChange(next.filter(Boolean))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPendingIndex(null)
    }
  }

  function remove(index: number) {
    const next = [...slots]
    next[index] = ''
    onChange(next.filter(Boolean))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {slots.map((url, i) => {
          const isPending = pendingIndex === i
          return (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden glass">
              {url ? (
                <>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center text-xs leading-none"
                    aria-label={t('onboarding.stepFields.gallery.removePhoto')}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRefs.current[i]?.click()}
                  disabled={isPending}
                  className="w-full h-full grid place-items-center text-2xl text-ink-muted hover:text-ink transition-colors disabled:opacity-60"
                  aria-label={t('onboarding.stepFields.gallery.addPhoto')}
                >
                  {isPending ? '…' : '+'}
                </button>
              )}
              <input
                ref={(el) => { fileRefs.current[i] = el }}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(i, f)
                  if (fileRefs.current[i]) fileRefs.current[i]!.value = ''
                }}
              />
            </div>
          )
        })}
      </div>

      <p className={`text-xs px-1 ${filled >= GALLERY_SIZE ? 'text-success' : 'text-ink-muted'}`}>
        {t('onboarding.stepFields.gallery.countNote', { filled, total: GALLERY_SIZE })}
      </p>

      {error && <p className="text-sm text-danger px-1">{error}</p>}
    </div>
  )
}
