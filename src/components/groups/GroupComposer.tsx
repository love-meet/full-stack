import { useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../../stores/ui'
import { useCreateGroupPost, useUploadGroupMedia } from '../../hooks/useGroupPostMutations'

type Props = {
  groupId: string
  groupSlug: string
  groupName: string
  onClose: () => void
}

type Media = { url: string; kind: 'image' | 'video'; aspect: number }

/**
 * Compose a group post — text, image, or video. Posts land in 'pending'
 * and only appear publicly after a group admin approves, so the success
 * state tells the user it's been submitted for review.
 */
export default function GroupComposer({ groupId, groupSlug, groupName, onClose }: Props) {
  useDrawerLock()
  const create = useCreateGroupPost(groupSlug)
  const upload = useUploadGroupMedia()
  const [text, setText] = useState('')
  const [media, setMedia] = useState<Media | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const trimmed = text.trim()
  const canPost = (trimmed.length > 0 || !!media) && !create.isPending && !upload.isPending

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setMedia(await upload.mutateAsync(file))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submit() {
    if (!canPost) return
    setError(null)
    try {
      await create.mutateAsync({ groupId, body: trimmed || null, media })
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose() }} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md bg-surface-2 rounded-t-3xl outline-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="pt-3 pb-1">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>
          <Drawer.Title className="px-5 pt-1 text-sm font-bold text-ink">
            Post to {groupName}
          </Drawer.Title>

          {sent ? (
            <div className="px-5 py-10 text-center">
              <div className="text-5xl mb-3">📨</div>
              <h3 className="text-lg font-extrabold text-ink">Submitted for review</h3>
              <p className="text-sm text-ink-2 mt-1">
                A group admin will approve it shortly. You'll see it marked
                <span className="text-gold font-semibold"> Pending review</span> in
                the feed until then.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="px-5 py-3">
              {/* Media preview */}
              {(upload.isPending || media) && (
                <div className="mb-3 flex items-center gap-3 glass rounded-2xl p-2">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 shrink-0 grid place-items-center">
                    {media?.kind === 'video' ? (
                      <video src={media.url} className="w-full h-full object-cover" muted />
                    ) : media?.kind === 'image' ? (
                      <img src={media.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-ink-muted animate-pulse">📎</span>
                    )}
                  </div>
                  <div className="flex-1 text-xs text-ink-muted">
                    {upload.isPending ? 'Uploading…' : `${media?.kind} attached`}
                  </div>
                  {media && (
                    <button onClick={() => setMedia(null)} aria-label="Remove" className="text-ink-muted hover:text-ink px-2">✕</button>
                  )}
                </div>
              )}

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 1000))}
                rows={4}
                autoFocus
                placeholder={media ? 'Add a caption (optional)…' : `Share something in ${groupName}…`}
                className="w-full bg-surface/60 border border-white/10 rounded-2xl px-3 py-2.5 outline-none text-ink text-[15px] placeholder:text-ink-muted resize-none focus:ring-brand no-scrollbar"
              />

              {error && <p className="text-xs text-danger mt-2">{error}</p>}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                  className="flex items-center gap-2 rounded-full px-4 py-2 glass text-sm font-semibold text-ink-2 hover:text-rose disabled:opacity-50"
                >
                  <span className="text-lg leading-none">＋</span>
                  <span>Photo / video</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
                />

                <button
                  onClick={submit}
                  disabled={!canPost}
                  className={[
                    'rounded-full px-5 py-2.5 text-sm font-bold transition-opacity',
                    canPost ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
                  ].join(' ')}
                >
                  {create.isPending ? 'Posting…' : 'Submit'}
                </button>
              </div>

              <p className="mt-3 text-[11px] text-ink-muted text-center">
                Posts are reviewed by a group admin before they appear.
              </p>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
