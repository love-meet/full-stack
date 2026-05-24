import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMyWithdrawals,
  useMyPayoutAccount,
  useRequestWithdrawal,
  useWithdrawable,
  type WithdrawalRequest,
} from '../../hooks/usePayments'
import { useUserCurrency } from '../../hooks/useFx'

export default function WithdrawScreen() {
  const navigate = useNavigate()
  const cur = useUserCurrency()
  const account = useMyPayoutAccount()
  const withdrawable = useWithdrawable()
  const request = useRequestWithdrawal()
  const history = useMyWithdrawals()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okFlash, setOkFlash] = useState(false)

  // Withdrawable is stored in USD; the user works in their local currency.
  const usdAvailable = withdrawable.data ?? 0
  const localAvailable = cur.toLocal(usdAvailable)
  const localAmount = Number(amount) || 0
  const usdAmount = cur.usdFromLocal(localAmount)

  const eligibleAt = account.data ? new Date(account.data.eligible_at) : null
  const inCooldown = !!eligibleAt && eligibleAt.getTime() > Date.now()
  const valid =
    localAmount > 0 && usdAmount <= usdAvailable + 1e-9 && !request.isPending && !inCooldown && !!account.data

  async function submit() {
    setError(null)
    try {
      await request.mutateAsync({ amountUsd: usdAmount, amountLocal: localAmount, currencyLocal: cur.code })
      setAmount('')
      setOkFlash(true)
      window.setTimeout(() => setOkFlash(false), 2400)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Withdraw</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        <div className="glass rounded-3xl p-5 text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
            Available to withdraw
          </div>
          {cur.pending || withdrawable.isPending ? (
            <div className="mt-3 mx-auto h-8 w-40 rounded-lg bg-white/10 animate-pulse" />
          ) : (
            <div className="mt-1 text-3xl font-extrabold text-gradient-warm">{cur.format(usdAvailable)}</div>
          )}
          <div className="text-xs text-ink-muted">{cur.pending ? '' : cur.code}</div>
        </div>

        {/* Gate: no payout details yet → prompt to add them. */}
        {account.status === 'success' && !account.data ? (
          <section className="glass rounded-2xl p-6 text-center space-y-3">
            <div className="text-3xl">🏦</div>
            <p className="text-sm text-ink-2">
              Add your bank details first. For security, withdrawals unlock
              <span className="text-ink font-semibold"> 3 days</span> after you add them.
            </p>
            <button
              onClick={() => navigate('/wallet/payout-details')}
              className="rounded-full px-5 py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose"
            >
              Add payout details
            </button>
          </section>
        ) : account.data ? (
          <section className="glass rounded-2xl p-5 space-y-4">
            {/* Saved bank details summary */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">Paying to</div>
                <div className="text-sm font-semibold text-ink truncate">{account.data.account_name}</div>
                <div className="text-[12px] text-ink-muted truncate">
                  {account.data.bank_name} · {account.data.account_number}
                </div>
              </div>
              <button
                onClick={() => navigate('/wallet/payout-details')}
                className="text-xs font-semibold text-ink-2 hover:text-rose shrink-0"
              >
                Change
              </button>
            </div>

            {inCooldown && (
              <div className="rounded-xl bg-gold/10 border border-gold/30 px-3 py-2 text-xs text-gold">
                Your payout details are in the 3-day verification window. You can withdraw on{' '}
                <span className="font-bold">{eligibleAt!.toLocaleDateString()}</span>.
              </div>
            )}

            <p className="text-sm text-ink-2">
              You can only withdraw earnings (gifts &amp; tips received and referral bonuses).
              The amount is locked when you request, and released once an admin approves the payout.
              Rejections are refunded in full.
            </p>

            <label className="block">
              <div className="text-xs font-bold text-ink-2 mb-1.5">Amount ({cur.code})</div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="lm-input text-center text-2xl font-extrabold"
                placeholder="0.00"
                disabled={inCooldown}
              />
              <button
                type="button"
                onClick={() => setAmount(String(Math.floor(localAvailable * 100) / 100))}
                disabled={inCooldown}
                className="mt-2 text-[11px] text-rose hover:underline font-semibold disabled:opacity-50"
              >
                Withdraw max ({cur.format(usdAvailable)})
              </button>
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}
            {okFlash && <p className="text-xs text-success">✓ Withdrawal requested — see it below. An admin will review it.</p>}

            <button
              onClick={submit}
              disabled={!valid}
              className={[
                'w-full rounded-full py-3 text-sm font-bold transition-opacity',
                valid ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
              ].join(' ')}
            >
              {request.isPending ? 'Submitting…' : 'Request withdrawal'}
            </button>
          </section>
        ) : (
          <div className="glass rounded-2xl h-40 animate-pulse" />
        )}

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            Recent withdrawals
          </h2>
          <ul className="space-y-1.5">
            {(history.data?.pages.flat() ?? []).map((w) => (
              <li key={w.id} className="glass rounded-2xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-base">⬆</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink">
                      {w.payout_amount_local != null
                        ? cur.formatLocal(w.payout_amount_local)
                        : cur.format(w.amount_usdt)}
                    </div>
                    <div className="text-[11px] text-ink-muted truncate">{w.destination}</div>
                  </div>
                  <Pill status={w.status} />
                </div>
                {w.reject_reason && <div className="mt-2 text-[11px] text-danger">{w.reject_reason}</div>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

function Pill({ status }: { status: WithdrawalRequest['status'] }) {
  const map: Record<WithdrawalRequest['status'], string> = {
    pending: 'bg-gold/15 text-gold',
    approved: 'bg-coral/15 text-coral',
    sent: 'bg-success/15 text-success',
    rejected: 'bg-danger/15 text-danger',
    failed: 'bg-danger/15 text-danger',
  }
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${map[status]}`}>
      {status}
    </span>
  )
}
