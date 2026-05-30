import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Show a small loading indicator on the confirm button. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Centered confirmation modal. Replaces window.confirm() for destructive
 * actions (Block, Delete) so the look matches the rest of the app.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (typeof document === 'undefined') return null
  // Portal to <body> so the DOM under the modal is just <body>, not the post
  // it was rendered next to. Without this, a tap on Confirm that unmounts
  // the modal mid-press can register as a "ghost click" on the post image
  // underneath, opening the lightbox instead of (or as well as) deleting.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-confirm-modal
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm glass rounded-3xl p-6 text-center"
          >
            <h3 id="confirm-title" className="text-lg font-extrabold text-ink">{title}</h3>
            {message && (
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{message}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel() }}
                disabled={busy}
                className="flex-1 rounded-full py-3 text-sm font-semibold glass text-ink-2 hover:text-ink disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirm() }}
                disabled={busy}
                className={[
                  'flex-1 rounded-full py-3 text-sm font-semibold disabled:opacity-60 transition-opacity',
                  destructive
                    ? 'bg-danger text-white shadow-lg shadow-danger/40'
                    : 'bg-gradient-brand text-white glow-rose',
                ].join(' ')}
              >
                {busy ? '…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
