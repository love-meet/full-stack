import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../../stores/ui'
import { useDeleteMessage } from '../../hooks/useMessageMutations'
import ConfirmDialog from '../ConfirmDialog'
import type { Message } from '../../hooks/useMessages'

type Props = {
  conversationId: string
  message: Message
  isMine: boolean
  onClose: () => void
  onReply: () => void
  onEdit: () => void
}

type Item = {
  icon: string
  label: string
  destructive?: boolean
  onClick: () => void | Promise<void>
}

/**
 * Long-press / right-click action sheet for a single chat bubble.
 *  - OWN:   Reply · Copy · Edit · Delete
 *  - OTHER: Reply · Copy
 * Mirrors `_archive/mobile/src/components/chat/MessageMenu.js`.
 */
export default function MessageActionsSheet({
  conversationId, message, isMine, onClose, onReply, onEdit,
}: Props) {
  useDrawerLock()
  const del = useDeleteMessage(conversationId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  const items: Item[] = [
    { icon: '↩', label: 'Reply', onClick: () => { onReply(); onClose() } },
    {
      icon: '📋',
      label: 'Copy',
      onClick: () => { void copyText(message.body ?? '', flash); onClose() },
    },
    ...(isMine
      ? [
          { icon: '✎', label: 'Edit', onClick: () => { onEdit(); onClose() } },
          { icon: '🗑', label: 'Delete', destructive: true, onClick: () => setConfirmDelete(true) },
        ] as Item[]
      : []),
  ]

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
            <Drawer.Title className="sr-only">Message options</Drawer.Title>

            {/* Preview the message at the top so the user knows which one. */}
            {!message.deleted_at && message.body && (
              <div className="px-4 pt-2 pb-1">
                <div
                  className={[
                    'inline-block max-w-full px-3 py-2 rounded-2xl text-sm',
                    isMine ? 'bg-gradient-brand text-white' : 'glass text-ink',
                  ].join(' ')}
                >
                  <span className="line-clamp-3 break-words whitespace-pre-wrap">{message.body}</span>
                </div>
              </div>
            )}

            <ul className="px-2 py-2">
              {items.map((it) => (
                <li key={it.label}>
                  <button
                    onClick={it.onClick}
                    disabled={busy}
                    className={[
                      'w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition-colors',
                      busy ? 'opacity-60 cursor-wait' : 'hover:bg-white/[0.04]',
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
                disabled={busy}
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
        open={confirmDelete}
        title="Delete this message?"
        message="The other person will see 'This message was deleted'."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true)
          try {
            await del.mutateAsync(message.id)
            setConfirmDelete(false)
            onClose()
          } catch (e) {
            flash((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

async function copyText(body: string, flash: (msg: string) => void) {
  if (!body) { flash('Nothing to copy'); return }
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
