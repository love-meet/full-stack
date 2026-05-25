import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useMyPayoutAccount, useSavePayoutAccount } from '../../hooks/usePayments'
import { useProfile } from '../../hooks/useProfile'
import { useHasPin } from '../../hooks/useSecurity'
import PinPromptModal from '../../components/PinPromptModal'

/**
 * Bank/payout details a user must save before withdrawing. Saving (or
 * changing) starts a 3-day verification window enforced server-side.
 */
export default function PayoutDetailsScreen() {
  const navigate = useNavigate()
  const profile = useProfile()
  const account = useMyPayoutAccount()
  const save = useSavePayoutAccount()
  const hasPin = useHasPin()

  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)

  // The account holder name is the user's real name from their profile —
  // not editable, so payouts can't be redirected to someone else.
  const p = profile.data
  const fullName = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || (p?.display_name ?? '')

  // Seed the bank fields from the existing account once it loads.
  useEffect(() => {
    const a = account.data
    if (a) {
      setBankName(a.bank_name)
      setAccountNumber(a.account_number)
      setBankCode(a.bank_code ?? '')
    }
  }, [account.data])

  const canSave =
    fullName.trim().length >= 2 &&
    bankName.trim().length >= 2 &&
    accountNumber.trim().length >= 6 &&
    !save.isPending

  // Tapping "Save" gates on the account PIN: no PIN → go set one;
  // otherwise prompt for it, and save only after it's verified.
  function attemptSave() {
    if (!canSave) return
    setError(null)
    if (hasPin.isPending) return
    if (!hasPin.data) {
      navigate('/security')
      return
    }
    setPinOpen(true)
  }

  async function doSave() {
    setPinOpen(false)
    try {
      await save.mutateAsync({
        accountName: fullName.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        bankCode: bankCode.trim() || null,
        countryCode: profile.data?.country_code ?? null,
      })
      setSaved(true)
      window.setTimeout(() => navigate('/wallet/withdraw', { replace: true }), 900)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const isEdit = !!account.data

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Payout details</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-5">
        <p className="text-sm text-ink-2">
          Where should we send your withdrawals? Add your bank account below.
          For security, a <span className="text-ink font-semibold">3-day verification window</span> applies
          after you add or change these details before you can withdraw.
        </p>

        <label className="block">
          <div className="text-xs font-bold text-ink-2 mb-1.5">Account holder name</div>
          <div className="lm-input flex items-center justify-between gap-2 opacity-90">
            <span className="text-ink truncate">{fullName || '—'}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-muted shrink-0">From your profile</span>
          </div>
          <p className="text-[11px] text-ink-muted mt-1">
            Must match your account name. Update it in <button type="button" onClick={() => navigate('/profile/edit')} className="text-rose hover:underline">Edit profile</button>.
          </p>
        </label>
        <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="e.g. GTBank, Wema, Access" />
        <Field label="Account number" value={accountNumber} onChange={(v) => setAccountNumber(v.replace(/[^0-9]/g, ''))} placeholder="0123456789" inputMode="numeric" />
        <Field label="Bank / sort code (optional)" value={bankCode} onChange={setBankCode} placeholder="e.g. 058" />

        {account.data && (
          <p className="text-[11px] text-ink-muted">
            {new Date(account.data.eligible_at).getTime() > Date.now()
              ? `Withdrawals unlock on ${new Date(account.data.eligible_at).toLocaleDateString()}.`
              : 'Your details are verified — you can withdraw.'}
            {' '}Changing them restarts the 3-day window.
          </p>
        )}

        {hasPin.data === false && (
          <p className="text-[11px] text-ink-muted">
            🔒 You'll be asked to set a PIN first — it secures your payout details and withdrawals.
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && <p className="text-sm text-success">✓ Saved.</p>}

        <button
          onClick={attemptSave}
          disabled={!canSave}
          className={[
            'w-full rounded-full py-3 text-sm font-bold transition-opacity',
            canSave ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
          ].join(' ')}
        >
          {save.isPending ? 'Saving…' : isEdit ? 'Update details' : 'Save details'}
        </button>
      </main>

      <AnimatePresence>
        {pinOpen && (
          <PinPromptModal
            title="Confirm with your PIN"
            subtitle="Enter your PIN to save these payout details."
            onVerified={doSave}
            onClose={() => setPinOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'text' | 'numeric'
}) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-ink-2 mb-1.5">{label}</div>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="lm-input"
      />
    </label>
  )
}
