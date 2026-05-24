import { useState } from 'react'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useUpdatePost } from '../hooks/usePostMutations'

type Props = {
  postId: string
  initialCaption: string | null
  onClose: () => void
}

export default function EditCaptionSheet({ postId, initialCaption, onClose }: Props) {
  useDrawerLock()
  const update = useUpdatePost()
  const [caption, setCaption] = useState(initialCaption ?? '')
  const [error, setError] = useState<string | null>(null)
  const dirty = (caption || '') !== (initialCaption || '')

  async function save() {
    if (!dirty) { onClose(); return }
    setError(null)
    try {
      await update.mutateAsync({
        postId,
        patch: { caption: caption.trim() || null },
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer.Root
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      modal
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-w-md bg-surface-2 rounded-t-3xl p-5 outline-none"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
        >
          <div className="pt-1 pb-3">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <Drawer.Title className="text-lg font-extrabold text-ink">Edit caption</Drawer.Title>
            <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl px-2">×</button>
          </div>

          <div className="glass rounded-2xl p-4 focus-within:ring-brand transition-shadow">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={2200}
              placeholder="Write something…"
              className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-base resize-none"
            />
            <div className="text-right text-[11px] text-ink-muted">{caption.length}/2200</div>
          </div>

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          <button
            onClick={save}
            disabled={!dirty || update.isPending}
            className={[
              'mt-4 w-full rounded-full py-3.5 font-semibold transition-opacity',
              dirty && !update.isPending
                ? 'bg-gradient-brand text-white glow-rose'
                : 'bg-surface-3 text-ink-muted',
            ].join(' ')}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
