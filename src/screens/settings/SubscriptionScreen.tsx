import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMySubscription,
  useSubscribe,
  useSubscriptionPlans,
  type SubscriptionPlan,
} from '../../hooks/usePayments'
import { useWallet } from '../../hooks/useWallet'
import { useUserCurrency } from '../../hooks/useFx'
import ConfirmDialog from '../../components/ConfirmDialog'

const MONTH_OPTIONS = [1, 3, 6, 12] as const

export default function SubscriptionScreen() {
  const navigate = useNavigate()
  const plans = useSubscriptionPlans()
  const sub = useMySubscription()
  const wallet = useWallet()
  const subscribe = useSubscribe()
  const fx = useUserCurrency()
  const [picking, setPicking] = useState<{ plan: SubscriptionPlan; months: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const balance = wallet.data?.balance_usdt ?? 0
  const active = sub.data
  const onFree = !active

  async function confirm() {
    if (!picking) return
    setError(null)
    try {
      await subscribe.mutateAsync({ planId: picking.plan.id, months: picking.months })
      setPicking(null)
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
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">Plans</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold text-gradient-warm">Find your person, faster</h1>
          <p className="text-sm text-ink-2">
            Upgrade to be seen by the right people — pay monthly, or save by paying ahead.
          </p>
        </div>

        {active && (
          <div className="glass rounded-3xl p-5 border border-rose/30">
            <div className="text-[10px] uppercase tracking-[0.18em] text-rose font-bold">
              Current subscription
            </div>
            <div className="mt-1 text-xl font-extrabold text-ink">
              {plans.data?.find((p) => p.id === active.plan_id)?.name ?? active.plan_id}
            </div>
            <div className="text-sm text-ink-muted">
              Renews / expires {new Date(active.expires_at).toLocaleDateString()}
            </div>
          </div>
        )}

        <p className="text-sm text-ink-2">
          Paid from your wallet balance. To top up, go to{' '}
          <button onClick={() => navigate('/wallet/deposit')} className="text-rose hover:underline font-semibold">
            Add funds
          </button>.
        </p>

        <div className="space-y-3">
          {/* Free — the default for everyone. */}
          <FreeCard isCurrent={onFree} />

          {plans.status === 'pending' && (
            <>
              <div className="glass rounded-2xl h-40 animate-pulse" />
              <div className="glass rounded-2xl h-40 animate-pulse" />
            </>
          )}

          {plans.data?.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              balance={balance}
              isCurrent={active?.plan_id === p.id}
              format={fx.ready || fx.code === 'USD' ? fx.format : (u) => `$${u.toFixed(2)}`}
              onPick={(months) => setPicking({ plan: p, months })}
            />
          ))}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
      </main>

      <ConfirmDialog
        open={picking != null}
        title={`Subscribe to ${picking?.plan.name}?`}
        message={
          picking
            ? `${(fx.ready || fx.code === 'USD' ? fx.format(picking.plan.price_usdt * picking.months) : `$${(picking.plan.price_usdt * picking.months).toFixed(2)}`)} will be debited from your wallet now for ${picking.months} month${picking.months === 1 ? '' : 's'} of ${picking.plan.name}.`
            : ''
        }
        confirmLabel="Subscribe"
        busy={subscribe.isPending}
        onCancel={() => setPicking(null)}
        onConfirm={confirm}
      />
    </div>
  )
}

function FreeCard({ isCurrent }: { isCurrent: boolean }) {
  return (
    <div className={['glass rounded-3xl p-5', isCurrent ? 'ring-1 ring-white/15' : ''].join(' ')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl font-extrabold text-ink">Free</h3>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-ink">$0</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">forever</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {['3 posts a week', 'Default chat & privacy settings', 'Join groups & games others host'].map((f) => (
          <li key={f} className="text-sm text-ink-2 flex items-center gap-2">
            <span className="text-ink-muted">•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-center bg-surface-3 text-ink-muted">
        {isCurrent ? 'Your current plan' : 'Default plan'}
      </div>
    </div>
  )
}

function PlanCard({
  plan, balance, isCurrent, format, onPick,
}: {
  plan: SubscriptionPlan
  balance: number
  isCurrent: boolean
  format: (usd: number) => string
  onPick: (months: number) => void
}) {
  const [months, setMonths] = useState(1)
  const total = plan.price_usdt * months
  const canAfford = balance >= total

  return (
    <div
      className={[
        'relative overflow-hidden glass rounded-3xl p-5 transition-shadow',
        isCurrent ? 'ring-1 ring-rose/40' : '',
        plan.coming_soon ? 'border border-white/10' : 'border border-rose/20',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl font-extrabold text-gradient-warm">{plan.name}</h3>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-ink">{format(plan.price_usdt)}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">/ month</div>
        </div>
      </div>

      {plan.description && <p className="mt-2 text-sm text-ink-2">{plan.description}</p>}

      {plan.features.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {plan.features.map((f) => (
            <li key={f} className="text-sm text-ink-2 flex items-start gap-2">
              <span className="text-rose mt-0.5">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {!plan.coming_soon && !isCurrent && (
        <>
          {/* Months selector — pay for more than a month up front. */}
          <div className="mt-4 flex gap-2">
            {MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={[
                  'flex-1 rounded-xl py-2 text-xs font-bold transition-colors',
                  months === m ? 'bg-rose/20 text-rose ring-1 ring-rose/40' : 'bg-surface-3 text-ink-muted',
                ].join(' ')}
              >
                {m} mo
              </button>
            ))}
          </div>

          <button
            onClick={() => onPick(months)}
            disabled={!canAfford}
            className={[
              'mt-3 w-full rounded-full py-2.5 text-sm font-bold transition-opacity',
              canAfford ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
            ].join(' ')}
          >
            {canAfford
              ? `Subscribe — ${format(total)}${months > 1 ? ` (${months} mo)` : ''}`
              : `Need ${format(total - balance)} more`}
          </button>
        </>
      )}

      {isCurrent && (
        <div className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-center bg-surface-3 text-ink-muted">
          Active
        </div>
      )}

      {/* Coming-soon lock */}
      {plan.coming_soon && (
        <div className="absolute top-4 right-4">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2 bg-black/45 rounded-full px-3 py-1.5">
            🔒 Coming soon
          </span>
        </div>
      )}
    </div>
  )
}
