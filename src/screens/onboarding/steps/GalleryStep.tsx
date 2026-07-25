import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GALLERY_SIZE, type StepProps } from '../types'
import { useUploadGalleryPhoto } from '../../../hooks/useUploadGalleryPhoto'

export default function GalleryStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  const upload = useUploadGalleryPhoto()
  const fileRefs = useRef<Array<HTMLInputElement | null>>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)

  async function onFile(index: number, file: File) {
    setError(null)
    setPendingIndex(index)
    try {
      const url = await upload.mutateAsync(file)
      const next = [...data.gallery]
      next[index] = url
      set({ gallery: next })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPendingIndex(null)
    }
  }

  function remove(index: number) {
    const next = [...data.gallery]
    next[index] = ''
    set({ gallery: next })
  }

  const filled = data.gallery.filter(Boolean).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: GALLERY_SIZE }).map((_, i) => {
          const url = data.gallery[i]
          const isPending = pendingIndex === i
          return (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden glass">
              {url ? (
                <>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => remove(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center text-xs leading-none"
                    aria-label={t('onboarding.stepFields.gallery.removePhoto')}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
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
