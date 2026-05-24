import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useDeleteComment } from '../hooks/useCommentMutations'
import { useBlockUser } from '../hooks/usePostActions'
import ConfirmDialog from './ConfirmDialog'
import type { PostCommentRow } from '../hooks/useComments'

type Props = {
  postId: string
  comment: PostCommentRow
  isMine: boolean
  onClose: () => void
  onEdit: () => void
  onReply: () => void
}

type Confirm = 'delete' | 'block' | null
type Item = {
  icon: string
  label: string
  destructive?: boolean
  onClick: () => void | Promise<void>
}

/**
 * 3-action bottom sheet for a single comment.
 *  - OWN:   Copy text · Edit · Delete
 *  - OTHER: Copy text · Reply · Block user
 */
export default function CommentActionsSheet({
  postId, comment, isMine, onClose, onEdit, onReply,
}: Props) {
  useDrawerLock()
  const del = useDeleteComment(postId)
  const block = useBlockUser()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function withBusy(label: string, op: () => Promise<unknown>, closeOnDone = false) {
    setBusyLabel(label)
    try {
      await op()
      if (closeOnDone) onClose()
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusyLabel(null)
    }
  }

  const authorLabel = comment.author_handle ?? comment.author_display_name ?? 'user'

  const ownItems: Item[] = [
    { icon: '📋', label: 'Copy text', onClick: () => copyText(comment.body, flash) },
    { icon: '✎', label: 'Edit', onClick: () => { onEdit(); onClose() } },
    { icon: '🗑', label: 'Delete', destructive: true, onClick: () => setConfirm('delete') },
  ]

  const otherItems: Item[] = [
    { icon: '📋', label: 'Copy text', onClick: () => copyText(comment.body, flash) },
    { icon: '↩', label: 'Reply', onClick: () => { onReply(); onClose() } },
    { icon: '🚫', label: `Block @${authorLabel}`, destructive: true, onClick: () => setConfirm('block') },
  ]

  const items = isMine ? ownItems : otherItems

  return (
    <>
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
            <Drawer.Title className="sr-only">Comment options</Drawer.Title>

            <ul className="px-2 py-2">
              {items.map((it) => (
                <li key={it.label}>
                  <button
                    onClick={it.onClick}
                    disabled={!!busyLabel}
                    className={[
                      'w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition-colors',
                      busyLabel ? 'opacity-60 cursor-wait' : 'hover:bg-white/[0.04]',
                      it.destructive ? 'text-danger' : 'text-ink',
                    ].join(' ')}
                  >
                    <span className="text-xl w-6 text-center">{it.icon}</span>
                    <span className="font-semibold">{it.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="px-4 pb-3 pt-1">
              <button
                onClick={onClose}
                disabled={!!busyLabel}
                className="w-full rounded-full py-3 glass text-ink-2 hover:text-ink font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] glass rounded-full px-4 py-2 text-sm text-ink pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this comment?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={busyLabel === 'Deleting…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await withBusy(
            'Deleting…',
            () => del.mutateAsync({ commentId: comment.id, parentId: comment.parent_id }),
            true,
          )
        }}
      />

      <ConfirmDialog
        open={confirm === 'block'}
        title={`Block @${authorLabel}?`}
        message="You won't see their posts or comments anymore. They won't be notified."
        confirmLabel="Block"
        destructive
        busy={busyLabel === 'Blocking…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await withBusy('Blocking…', () => block.mutateAsync(comment.author_id), true)
            .then(() => flash('Blocked'))
        }}
      />
    </>
  )
}

async function copyText(body: string, flash: (msg: string) => void) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(body)
      flash('Copied')
    } else {
      const ta = document.createElement('textarea')
      ta.value = body
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      flash('Copied')
    }
  } catch {
    flash('Could not copy')
  }
}
