import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import UseALATPay from 'react-alatpay'
import {
  useMySubscription, useRecordAlatpayDeposit, useSubscribe, useSubscriptionPlans,
  type SubscriptionPlan,
} from '../../hooks/usePayments'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../stores/auth'
import { useUserCurrency } from '../../hooks/useFx'

const BUSINESS_ID = import.meta.env.VITE_ALATPAY_BUSINESS_ID as string | undefined
const API_KEY = import.meta.env.VITE_ALATPAY_API_KEY as string | undefined

const MONTH_OPTIONS = [1, 3, 6, 12] as const

/**
 * Pay-and-unlock checkout for Premium / VIP. Goes straight to ALATPay for the
 * exact plan amount — no "top up wallet first" detour. On a successful
 * transaction we record the deposit (which credits the wallet) and immediately
 * call subscribe(), so the plan is active by the time we navigate away.
 */
export default function PlanCheckoutScreen() {
  const { planId = '' } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const plansQ = useSubscriptionPlans()
  const sub = useMySubscription()
  const session = useAuth((s) => s.session)
  const profile = useProfile()
  const cur = useUserCurrency()
  const record = useRecordAlatpayDeposit()
  const subscribe = useSubscribe()

  const plan: SubscriptionPlan | undefined = plansQ.data?.find((p) => p.id === planId)
  const [months, setMonths] = useState<number>(1)
  const [status, setStatus] = useState<'idle' | 'opening' | 'verifying' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const totalUsd = (plan?.price_usdt ?? 0) * months
  const localAmount = cur.isNgn ? cur.toLocal(totalUsd) : totalUsd
  const chargeCurrency: 'NGN' | 'USD' = cur.isNgn ? 'NGN' : 'USD'
  const chargeAmount = cur.isNgn ? Math.round(localAmount) : Number(totalUsd.toFixed(2))
  const configured = !!BUSINESS_ID && !!API_KEY
  const alreadyActive = !!sub.data && sub.data.plan_id === planId
  const canPay =
    !!plan && !alreadyActive && configured && cur.ready &&
    status !== 'opening' && status !== 'verifying'

  // Open ALATPay; once a transaction comes back, record + subscribe in one go.
  function pay() {
    if (!canPay || !session || !plan) return
    setError(null)
    setStatus('opening')
    const p = profile.data
    const checkout = UseALATPay({
      amount: chargeAmount,
      currency: chargeCurrency,
      apiKey: API_KEY,
      businessId: BUSINESS_ID,
      email: session.user.email || 'user@lovemeet.app',
      firstName: p?.first_name ?? p?.display_name ?? 'Love',
      lastName: p?.last_name ?? 'Meet',
      phone: '',
      metadata: session.user.id,
      color: undefined,
      onClose: () => { setStatus((s) => (s === 'opening' ? 'idle' : s)) },
      onTransaction: async (response: unknown) => {
        const tx = parseAlatpay(response)
        if (!tx.completed && !tx.transactionId) {
          setStatus('idle'); setError('Payment was not completed.'); return
        }
        const ref = tx.transactionId ?? `alatpay-${session.user.id}-${Date.now()}`
        setStatus('verifying')
        try {
          const dep = await record.mutateAsync({
            transactionId: ref,
            amountUsd: totalUsd,
            amountLocal: localAmount,
            currencyLocal: cur.code,
            completed: tx.completed,
            payload: response,
          })
          if (dep.status !== 'paid') {
            setStatus('idle')
            setError('Payment is processing — your plan will activate once it clears. Contact support if it doesn’t.')
            return
          }
          // Activate the plan immediately on the same screen.
          await subscribe.mutateAsync({ planId: plan.id, months })
          setStatus('done')
          window.setTimeout(() => navigate('/feed', { replace: true }), 1400)
        } catch (e) {
          setError((e as Error).message); setStatus('idle')
        }
      },
    })
    checkout.submit()
  }

  const fmt = cur.ready || cur.code === 'USD' ? cur.format : (u: number) => `$${u.toFixed(2)}`

  // If the user backs out without finishing payment we drop a flag so the
  // feed can nudge them with "you're on Free — pick a plan".
  function backOut() {
    if (status !== 'done' && !alreadyActive) {
      sessionStorage.setItem('lm.checkout.cancelled', '1')
    }
    navigate(-1)
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={backOut} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{plan?.name ?? 'Checkout'}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-5">
        {plansQ.status === 'pending' && <div className="glass rounded-3xl h-72 animate-pulse" />}
        {plansQ.status === 'success' && !plan && (
          <div className="glass rounded-2xl p-4 text-center text-ink-2">Plan not found.</div>
        )}
        {plan && (
          <>
            <div className="glass rounded-3xl p-5 ring-1 ring-rose/30">
              <div className="flex items-baseline justify-between">
                <h1 className="text-2xl font-extrabold text-gradient-warm">{plan.name}</h1>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-ink">{fmt(plan.price_usdt)}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">/ month</div>
                </div>
              </div>
              {plan.description && <p className="mt-2 text-sm text-ink-2">{plan.description}</p>}
              {plan.features.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-ink-2 flex items-start gap-2">
                      <span className="text-rose mt-0.5">✓</span><span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {alreadyActive ? (
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-sm text-success font-bold">✓ You're already on {plan.name}.</p>
                <button onClick={() => navigate('/feed')} className="mt-3 w-full rounded-full py-2.5 text-sm font-bold bg-gradient-brand text-white glow-rose">
                  Back to feed
                </button>
              </div>
            ) : (
              <>
                <section>
                  <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">Pay for how long</h2>
                  <div className="flex gap-2">
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
                </section>

                <section className="glass rounded-2xl p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-ink-2">Total</span>
                    <span className="text-2xl font-extrabold text-ink">{fmt(totalUsd)}{months > 1 && <span className="text-[11px] text-ink-muted ml-1">({months} mo)</span>}</span>
                  </div>
                  <p className="mt-2 text-[12px] text-ink-muted">
                    Pay securely via <span className="font-semibold text-ink">ALATPay</span> — card, bank transfer or USSD.
                    {cur.isNgn ? ' Charged in ₦.' : ' Charged in USD.'} Plan unlocks as soon as payment confirms.
                  </p>
                </section>

                {!configured && (
                  <p className="text-xs text-danger">Payments aren't configured. Set VITE_ALATPAY_BUSINESS_ID and VITE_ALATPAY_API_KEY.</p>
                )}
                {error && <p className="text-sm text-danger">{error}</p>}
                {status === 'done' && <p className="text-sm text-success">✓ Plan activated — taking you to the feed…</p>}

                <button
                  onClick={pay}
                  disabled={!canPay}
                  className={[
                    'w-full rounded-full py-3.5 text-sm font-extrabold transition-opacity',
                    canPay ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
                  ].join(' ')}
                >
                  {status === 'opening' ? 'Opening checkout…'
                    : status === 'verifying' ? 'Activating your plan…'
                    : `Pay ${cur.isNgn ? cur.formatLocal(localAmount) : fmt(totalUsd)} & unlock ${plan.name}`}
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/** Same ALATPay parser as DepositScreen — pulls transactionId + success. */
function parseAlatpay(response: unknown): { transactionId: string | null; completed: boolean } {
  if (!response || typeof response !== 'object') return { transactionId: null, completed: false }
  const r = response as Record<string, unknown>
  const value = (r.Value ?? r.value ?? {}) as Record<string, unknown>
  const d = (r.data ?? r.Data ?? value.Data ?? value.data ?? r) as Record<string, unknown>
  const customer = (d.Customer ?? d.customer ?? {}) as Record<string, unknown>
  const id =
    d.Id ?? d.id ?? d.transactionId ?? d.TransactionId ??
    customer.TransactionId ?? customer.transactionId ?? r.transactionId
  const boolOk = r.status === true || value.Status === true || r.Status === true
  const strStatus = String(d.Status ?? d.status ?? '').toLowerCase()
  const completed = boolOk || strStatus === 'completed' || strStatus === 'success' || strStatus === 'successful'
  return { transactionId: id ? String(id) : null, completed }
}

