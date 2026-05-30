import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { useNavigate } from 'react-router-dom'
import { useDrawerLock } from '../../stores/ui'
import {
  useBlockUser,
  useIsMuting,
  useMuteUser,
  useUnmuteUser,
} from '../../hooks/usePostActions'
import {
  useDeleteConversation,
  useMarkConversationUnread,
  useTogglePinConversation,
} from '../../hooks/useChatActions'
import ConfirmDialog from '../ConfirmDialog'

type Props = {
  otherUserId: string
  otherHandle: string | null
  conversationId: string | null
  /** Whether this conversation is currently pinned for me — drives the pin/unpin label. */
  isPinned: boolean
  /** Toggle the in-chat search bar in the parent screen. */
  onToggleSearch: () => void
  onClose: () => void
}

type Confirm = 'block' | 'delete' | null
type Item = {
  icon: string
  label: string
  hint?: string
  destructive?: boolean
  busy?: boolean
  onClick: () => void | Promise<void>
}

/**
 * The 6-item options menu for the chat detail header:
 *   1. View profile
 *   2. Search in chat
 *   3. Pin / Unpin chat
 *   4. Mute / Unmute notifications
 *   5. Mark as unread
 *   6. Block user
 */
export default function ChatOptionsSheet({
  otherUserId, otherHandle, conversationId, isPinned, onToggleSearch, onClose,
}: Props) {
  useDrawerLock()
  const navigate = useNavigate()
  const mute = useMuteUser()
  const unmute = useUnmuteUser()
  const block = useBlockUser()
  const muting = useIsMuting(otherUserId)
  const pin = useTogglePinConversation()
  const markUnread = useMarkConversationUnread()
  const deleteConv = useDeleteConversation()

  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function withBusy(label: string, op: () => Promise<unknown>) {
    setBusyLabel(label)
    try {
      await op()
    } catch (e) {
      flash((e as Error).message)
      throw e
    } finally {
      setBusyLabel(null)
    }
  }

  const items: Item[] = [
    {
      icon: '👤',
      label: 'View profile',
      hint: 'Open their full profile',
      onClick: () => { onClose(); navigate(`/profile/${otherUserId}`) },
    },
    {
      icon: '⌕',
      label: 'Search in chat',
      hint: 'Find a message in this conversation',
      onClick: () => { onToggleSearch(); onClose() },
    },
    isPinned
      ? {
          icon: '📌',
          label: 'Unpin chat',
          hint: 'Stop pinning to top of your chat list',
          busy: pin.isPending,
          onClick: () => {
            if (!conversationId) return
            withBusy('Unpinning…', () => pin.mutateAsync(conversationId))
              .then(() => { flash('Unpinned'); onClose() })
              .catch(() => {})
          },
        }
      : {
          icon: '📍',
          label: 'Pin chat',
          hint: 'Keep this conversation at the top',
          busy: pin.isPending,
          onClick: () => {
            if (!conversationId) return
            withBusy('Pinning…', () => pin.mutateAsync(conversationId))
              .then(() => { flash('Pinned'); onClose() })
              .catch(() => {})
          },
        },
    muting.data
      ? {
          icon: '🔔',
          label: `Unmute @${otherHandle ?? 'user'}`,
          hint: 'Their posts come back to your feed',
          busy: unmute.isPending,
          onClick: () =>
            withBusy('Unmuting…', () => unmute.mutateAsync(otherUserId))
              .then(() => { flash('Unmuted'); onClose() })
              .catch(() => {}),
        }
      : {
          icon: '🔕',
          label: `Mute @${otherHandle ?? 'user'}`,
          hint: 'Hide their posts from your feed',
          busy: mute.isPending,
          onClick: () =>
            withBusy('Muting…', () => mute.mutateAsync(otherUserId))
              .then(() => { flash('Muted'); onClose() })
              .catch(() => {}),
        },
    {
      icon: '●',
      label: 'Mark as unread',
      hint: 'Roll back the read indicator so this chat shows as unread',
      busy: markUnread.isPending,
      onClick: () => {
        if (!conversationId) return
        withBusy('Updating…', () => markUnread.mutateAsync(conversationId))
          .then(() => { flash('Marked unread'); onClose() })
          .catch(() => {})
      },
    },
    {
      icon: '🗑',
      label: 'Delete chat',
      hint: 'Removes this conversation from your list (they keep history)',
      destructive: true,
      onClick: () => setConfirm('delete'),
    },
    {
      icon: '🚫',
      label: `Block @${otherHandle ?? 'user'}`,
      hint: 'Strongest — no posts, no DMs',
      destructive: true,
      onClick: () => setConfirm('block'),
    },
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
            <Drawer.Title className="sr-only">Chat options</Drawer.Title>

            <ul className="px-2 py-2">
              {items.map((it) => (
                <li key={it.label}>
                  <button
                    onClick={it.onClick}
                    disabled={!!busyLabel || it.busy}
                    className={[
                      'w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition-colors',
                      busyLabel || it.busy ? 'opacity-60 cursor-wait' : 'hover:bg-white/[0.04]',
                      it.destructive ? 'text-danger' : 'text-ink',
                    ].join(' ')}
                  >
                    <span className="text-xl w-6 text-center shrink-0">{it.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{it.label}</span>
                      {it.hint && (
                        <span className="block text-[11px] text-ink-muted font-medium truncate">
                          {it.hint}
                        </span>
                      )}
                    </span>
                    {!it.destructive && (
                      <span className="text-ink-muted text-base shrink-0">›</span>
                    )}
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
        open={confirm === 'block'}
        title={`Block @${otherHandle ?? 'this user'}?`}
        message="You won't see their posts, and they can't send you new messages. They won't be notified."
        confirmLabel="Block"
        destructive
        busy={busyLabel === 'Blocking…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          try {
            await withBusy('Blocking…', () => block.mutateAsync(otherUserId))
            flash('Blocked')
            onClose()
            navigate('/chat', { replace: true })
          } catch { /* flash already shown */ }
        }}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this chat?"
        message="It'll vanish from your chat list. The other person keeps the history and you can start a fresh chat with them anytime."
        confirmLabel="Delete"
        destructive
        busy={busyLabel === 'Deleting…'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!conversationId) { setConfirm(null); return }
          setConfirm(null)
          try {
            await withBusy('Deleting…', () => deleteConv.mutateAsync(conversationId))
            onClose()
            navigate('/chat', { replace: true })
          } catch { /* flash already shown */ }
        }}
      />
    </>
  )
}
