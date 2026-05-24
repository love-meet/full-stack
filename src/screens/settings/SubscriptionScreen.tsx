import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMySubscription,
  useSubscribe,
  useSubscriptionPlans,
  type SubscriptionPlan,
} from '../../hooks/usePayments'
import { useWallet } from '../../hooks/useWallet'
import ConfirmDialog from '../../components/ConfirmDialog'

export default function SubscriptionScreen() {
  const navigate = useNavigate()
  const plans = useSubscriptionPlans()
  const sub = useMySubscription()
  const wallet = useWallet()
  const subscribe = useSubscribe()
  const [picking, setPicking] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const balance = wallet.data?.balance_usdt ?? 0
  const active = sub.data

  async function confirm() {
    if (!picking) return
    setError(null)
    try {
      await subscribe.mutateAsync(picking.id)
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
          <div className="flex-1 text-center text-ink font-bold">Subscription</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {active && (
          <div className="glass rounded-3xl p-5 border border-rose/30">
            <div className="text-[10px] uppercase tracking-[0.18em] text-rose font-bold">
              Current subscription
            </div>
            <div className="mt-1 text-xl font-extrabold text-ink">
              {plans.data?.find((p) => p.id === active.plan_id)?.name ?? active.plan_id}
            </div>
            <div className="text-sm text-ink-muted">
              Expires {new Date(active.expires_at).toLocaleDateString()}
            </div>
          </div>
        )}

        <p className="text-sm text-ink-2">
          Subscriptions are paid from your wallet balance. To top up,
          go to <button onClick={() => navigate('/wallet/deposit')} className="text-rose hover:underline font-semibold">Add funds</button>.
        </p>

        <div className="space-y-3">
          {plans.status === 'pending' && (
            <>
              <div className="glass rounded-2xl h-32 animate-pulse" />
              <div className="glass rounded-2xl h-32 animate-pulse" />
              <div className="glass rounded-2xl h-32 animate-pulse" />
            </>
          )}
          {plans.data?.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              balance={balance}
              isCurrent={active?.plan_id === p.id}
              onPick={() => setPicking(p)}
            />
          ))}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
      </main>

      <ConfirmDialog
        open={picking != null}
        title={`Subscribe to ${picking?.name}?`}
        message={`${picking?.price_usdt.toFixed(2)} USDT will be debited from your wallet immediately. Your subscription stays active for ${picking?.duration_days} days.`}
        confirmLabel="Subscribe"
        busy={subscribe.isPending}
        onCancel={() => setPicking(null)}
        onConfirm={confirm}
      />
    </div>
  )
}

function PlanCard({
  plan, balance, isCurrent, onPick,
}: {
  plan: SubscriptionPlan
  balance: number
  isCurrent: boolean
  onPick: () => void
}) {
  const canAfford = balance >= plan.price_usdt
  return (
    <div
      className={[
        'glass rounded-3xl p-5 transition-shadow',
        isCurrent ? 'ring-1 ring-rose/40' : '',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl font-extrabold text-gradient-warm">{plan.name}</h3>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-ink">
            {plan.price_usdt.toLocaleString()}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
            USDT / {plan.duration_days}d
          </div>
        </div>
      </div>

      {plan.features.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.features.map((f) => (
            <li key={f} className="text-sm text-ink-2 flex items-center gap-2">
              <span className="text-rose">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onPick}
        disabled={!canAfford || isCurrent}
        className={[
          'mt-4 w-full rounded-full py-2.5 text-sm font-bold transition-opacity',
          isCurrent
            ? 'bg-surface-3 text-ink-muted cursor-default'
            : canAfford
              ? 'bg-gradient-brand text-white glow-rose'
              : 'bg-surface-3 text-ink-muted',
        ].join(' ')}
      >
        {isCurrent
          ? 'Active'
          : canAfford
            ? `Subscribe for ${plan.price_usdt} USDT`
            : `Need ${(plan.price_usdt - balance).toFixed(2)} more`}
      </button>
    </div>
  )
}
