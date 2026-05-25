import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { useCloseAccount } from '../../hooks/useCloseAccount'
import ConfirmDialog from '../../components/ConfirmDialog'

const CONFIRM_PHRASE = 'DELETE'

export default function CloseAccountScreen() {
  const navigate = useNavigate()
  const close = useCloseAccount()
  const signOut = useAuth((s) => s.signOut)
  const [typed, setTyped] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = typed.trim() === CONFIRM_PHRASE

  async function doClose() {
    setError(null)
    setShowConfirm(false)
    try {
      await close.mutateAsync()
      await signOut()
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">Close account</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <div className="glass rounded-3xl p-6 border border-danger/30">
          <div className="flex items-start gap-3">
            <span className="text-3xl shrink-0">⚠</span>
            <div>
              <h1 className="text-lg font-extrabold text-ink">This is permanent.</h1>
              <p className="mt-1 text-sm text-ink-2">
                Closing your account hard-deletes your auth record. Your
                profile, posts, comments, chats, gifts sent and received,
                wallet, and ledger entries all go with it via cascading
                foreign keys. This cannot be undone.
              </p>
            </div>
          </div>

          <ul className="mt-5 space-y-2 text-sm text-ink-2">
            <li>· Your handle becomes available for someone else to take.</li>
            <li>· Direct messages you sent stay visible to the other person until they delete the conversation, but your identity on those messages becomes blank.</li>
            <li>· Any pending withdrawal you haven't claimed is forfeited.</li>
          </ul>

          <div className="mt-6">
            <label className="block">
              <div className="text-xs font-bold text-ink-2 mb-1.5">
                Type <span className="font-mono text-danger">{CONFIRM_PHRASE}</span> to confirm
              </div>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="lm-input text-center tracking-[0.3em] font-extrabold"
              />
            </label>
          </div>

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={!ready || close.isPending}
            className={[
              'mt-5 w-full rounded-full py-3 text-sm font-bold transition-opacity',
              !ready || close.isPending
                ? 'bg-surface-3 text-ink-muted'
                : 'bg-danger text-white shadow-lg shadow-danger/40',
            ].join(' ')}
          >
            {close.isPending ? 'Deleting…' : 'Permanently close my account'}
          </button>
        </div>
      </main>

      <ConfirmDialog
        open={showConfirm}
        title="Last chance"
        message="Your account and all of your data will be gone in a moment. This cannot be undone."
        confirmLabel="Yes, delete forever"
        destructive
        busy={close.isPending}
        onCancel={() => setShowConfirm(false)}
        onConfirm={doClose}
      />
    </div>
  )
}
