import { useRef, useState } from 'react'
import type { StepProps } from '../types'
import { useUploadAvatar } from '../../../hooks/useUploadAvatar'
import { defaultAvatar } from '../../../lib/avatar'

/**
 * The profile picture — required, because the feed is nothing but pictures.
 *
 * §4 asks for a good one plainly, and offers a suggested image to anyone who
 * wants to stay anonymous as a real, dignified option rather than a
 * punishment. So: the ask is direct, the suggested images sit right there at
 * the same size as the upload, and nothing about choosing one reads as second
 * best or nags the user to change it later.
 */

const SUGGESTED: { url: string; label: string }[] = [
  { url: '/female.jpg', label: 'Suggested 1' },
  { url: '/male.jpg', label: 'Suggested 2' },
  { url: '/default-profile.jpg', label: 'Suggested 3' },
]

export default function PictureStep({ data, set }: StepProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const upload = useUploadAvatar()
  const [error, setError] = useState<string | null>(null)

  const displayed = data.avatar || defaultAvatar(data.gender || null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    try {
      const url = await upload.mutateAsync(f)
      set({ avatar: url, avatarIsSuggested: false })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      // Allow re-picking the same file later.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="relative group rounded-full"
          aria-label="Choose profile photo"
        >
          <span className="absolute inset-0 rounded-full bg-gradient-brand blur-md opacity-70" aria-hidden />
          <img
            src={displayed}
            alt=""
            className="relative w-32 h-32 rounded-full object-cover ring-4 ring-surface"
          />
          <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-gradient-brand text-white grid place-items-center text-base font-bold glow-rose">
            📷
          </span>
          {upload.isPending && (
            <span className="absolute inset-0 rounded-full grid place-items-center bg-black/40 text-white text-xs font-bold">
              …
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="rounded-full px-5 py-2.5 text-sm font-bold bg-gradient-brand text-white glow-rose disabled:opacity-60"
        >
          {data.avatar && !data.avatarIsSuggested ? 'Choose a different photo' : 'Upload a photo'}
        </button>

        <p className="text-xs text-ink-muted text-center max-w-xs">
          Use a clear one of your face — it's the whole first impression here.
        </p>

        {error && <p className="text-xs text-danger">{error}</p>}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" aria-hidden />
          <span className="text-[10px] uppercase tracking-wider text-ink-muted">or stay anonymous</span>
          <span className="h-px flex-1 bg-white/10" aria-hidden />
        </div>

        <p className="text-xs text-ink-2 text-center max-w-sm mx-auto">
          Not ready to show your face? Pick one of these. Plenty of people start
          this way, and you can swap it for your own photo whenever you like.
        </p>

        <div className="flex justify-center gap-4">
          {SUGGESTED.map((s) => {
            const active = data.avatar === s.url
            return (
              <button
                key={s.url}
                type="button"
                onClick={() => set({ avatar: s.url, avatarIsSuggested: true })}
                aria-label={s.label}
                aria-pressed={active}
                className="rounded-full"
              >
                <img
                  src={s.url}
                  alt=""
                  className={[
                    'w-20 h-20 rounded-full object-cover transition-shadow',
                    active
                      ? 'ring-4 ring-rose glow-rose'
                      : 'ring-2 ring-white/15 hover:ring-white/40',
                  ].join(' ')}
                />
              </button>
            )
          })}
        </div>
      </section>

      {/* The agreement (§07).
          A real checkbox rather than an implied "by continuing you agree" —
          an implied consent is the one a regulator discards, and this is the
          last screen of signup anyway, so it costs a tap rather than a step.
          The 18+ line is separate from the documents on purpose: age is a
          statement of fact about the person, not an acceptance of terms, and
          they are recorded as two different consents. */}
      <section className="pt-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.consent}
            onChange={(e) => set({ consent: e.target.checked })}
            className="mt-0.5 w-5 h-5 shrink-0 accent-rose"
          />
          <span className="text-xs text-ink-2 leading-relaxed">
            I'm 18 or over, and I accept the{' '}
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="text-rose font-semibold underline">terms</a>,{' '}
            <a href="/legal/privacy" target="_blank" rel="noreferrer" className="text-rose font-semibold underline">privacy policy</a>{' '}
            and{' '}
            <a href="/legal/guidelines" target="_blank" rel="noreferrer" className="text-rose font-semibold underline">community guidelines</a>.
          </span>
        </label>
      </section>
    </div>
  )
}
