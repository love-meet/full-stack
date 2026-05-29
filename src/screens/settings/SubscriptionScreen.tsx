import { useNavigate } from 'react-router-dom'
import {
  useMySubscription,
  useSubscriptionPlans,
  type SubscriptionPlan,
} from '../../hooks/usePayments'
import { useUserCurrency } from '../../hooks/useFx'

export default function SubscriptionScreen() {
  const navigate = useNavigate()
  const plans = useSubscriptionPlans()
  const sub = useMySubscription()
  const fx = useUserCurrency()

  const active = sub.data
  const onFree = !active

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
          Pay securely with <span className="font-semibold text-ink">ALATPay</span> — card, bank
          transfer or USSD. Your plan unlocks as soon as payment confirms.
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
              isCurrent={active?.plan_id === p.id}
              format={fx.ready || fx.code === 'USD' ? fx.format : (u) => `$${u.toFixed(2)}`}
              onPick={() => navigate(`/plans/${p.id}`)}
            />
          ))}
        </div>

      </main>
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
        {['3 posts a week', 'Default chat & privacy settings', 'Create & join games'].map((f) => (
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
  plan, isCurrent, format, onPick,
}: {
  plan: SubscriptionPlan
  isCurrent: boolean
  format: (usd: number) => string
  onPick: () => void
}) {
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
        <button
          onClick={onPick}
          className="mt-4 w-full rounded-full py-2.5 text-sm font-bold bg-gradient-brand text-white glow-rose"
        >
          Subscribe now
        </button>
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
