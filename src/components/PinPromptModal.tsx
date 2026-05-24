import { useState } from 'react'
import { motion } from 'framer-motion'
import { useVerifyPin } from '../hooks/useSecurity'

type Props = {
  title?: string
  subtitle?: string
  onVerified: () => void
  onClose: () => void
}

/**
 * Asks the user to enter their account PIN and verifies it server-side
 * (verify_pin). Calls onVerified() on a correct PIN. Render conditionally
 * inside an <AnimatePresence> so it animates in/out.
 */
export default function PinPromptModal({ title, subtitle, onVerified, onClose }: Props) {
  const verify = useVerifyPin()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = /^\d{4,6}$/.test(pin) && !verify.isPending

  async function submit() {
    if (!canSubmit) return
    setError(null)
    try {
      const ok = await verify.mutateAsync(pin)
      if (ok) onVerified()
      else { setError('Incorrect PIN. Try again.'); setPin('') }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full sm:max-w-xs glass rounded-t-3xl sm:rounded-3xl p-6 m-0 sm:m-4 text-center"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <div className="text-3xl mb-2">🔒</div>
        <h2 className="text-lg font-extrabold text-ink">{title ?? 'Enter your PIN'}</h2>
        <p className="text-sm text-ink-muted mt-1">{subtitle ?? 'Confirm it\'s you to continue.'}</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="••••"
          className="lm-input mt-4 text-center text-3xl font-extrabold tracking-[0.4em]"
        />

        {error && <p className="text-xs text-danger mt-2">{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={[
            'mt-4 w-full rounded-full py-3 text-sm font-bold transition-opacity',
            canSubmit ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
          ].join(' ')}
        >
          {verify.isPending ? 'Verifying…' : 'Confirm'}
        </button>
        <button onClick={onClose} className="mt-2 w-full py-2 text-sm text-ink-muted hover:text-ink font-semibold">
          Cancel
        </button>
      </motion.div>
    </motion.div>
  )
}
