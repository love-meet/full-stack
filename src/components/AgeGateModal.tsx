import { useState } from 'react'
import { motion } from 'framer-motion'
import { useUpdateProfile } from '../hooks/useProfile'

type Props = {
  onConfirm: () => void
  onDecline: () => void
}

export default function AgeGateModal({ onConfirm, onDecline }: Props) {
  const update = useUpdateProfile()
  const [error, setError] = useState<string | null>(null)
  const busy = update.isPending

  async function confirm() {
    setError(null)
    try {
      // Persist so we don't ask again on this account.
      await update.mutateAsync({ age_18_confirmed: true })
      onConfirm()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md px-5"
      onClick={onDecline}
    >
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="glass rounded-3xl p-7 max-w-md w-full text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">🔞</div>
        <h2 className="text-2xl font-extrabold text-gradient-warm">Adults only</h2>
        <p className="text-ink-2 text-sm leading-relaxed">
          The Naughty room contains explicit text content. You must be 18 or
          older to enter. By continuing, you confirm you're an adult.
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 rounded-full py-3 text-sm font-semibold glass text-ink-2 hover:text-ink"
          >
            Take me back
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="flex-1 rounded-full py-3 text-sm font-semibold bg-gradient-brand text-white glow-rose disabled:opacity-60"
          >
            {busy ? 'Confirming…' : "I'm 18+, continue"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
