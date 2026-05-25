import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UseALATPay from 'react-alatpay'
import { useMyDeposits, useRecordAlatpayDeposit, type Deposit } from '../../hooks/usePayments'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../stores/auth'
import { useUserCurrency } from '../../hooks/useFx'

const BUSINESS_ID = import.meta.env.VITE_ALATPAY_BUSINESS_ID as string | undefined
const API_KEY = import.meta.env.VITE_ALATPAY_API_KEY as string | undefined

const NGN_PRESETS = [1000, 2000, 5000, 10000, 20000] // local ₦ amounts
const USD_PRESETS = [5, 10, 20, 50, 100]              // USD amounts (shown in local)

export default function DepositScreen() {
  const navigate = useNavigate()
  const profile = useProfile()
  const session = useAuth((s) => s.session)
  const email = session?.user.email ?? ''
  const record = useRecordAlatpayDeposit()
  const deposits = useMyDeposits()
  const cur = useUserCurrency()

  // Presets are LOCAL ₦ amounts for Nigerians; for everyone else they're USD
  // amounts displayed in the user's local currency.
  const presetLocals = cur.isNgn ? NGN_PRESETS : USD_PRESETS.map((u) => cur.toLocal(u))
  const [amount, setAmount] = useState('2000')
  const [status, setStatus] = useState<'idle' | 'opening' | 'verifying' | 'done' | 'cancelled'>('idle')
  const [error, setError] = useState<string | null>(null)

  // The user enters/sees their LOCAL currency. We record the USD equivalent
  // (base). ALATPay charges Nigerians in NGN and everyone else in USD.
  const localAmount = Number(amount) || 0
  const usd = cur.usdFromLocal(localAmount)
  const chargeCurrency: 'NGN' | 'USD' = cur.isNgn ? 'NGN' : 'USD'
  const chargeAmount = cur.isNgn ? Math.round(localAmount) : Number(usd.toFixed(2))
  const minLocal = cur.isNgn ? 100 : cur.toLocal(1) // ₦100 or ~$1
  const meetsMin = cur.isNgn ? localAmount >= 100 : usd >= 1
  const configured = !!BUSINESS_ID && !!API_KEY
  const canPay = meetsMin && configured && cur.ready && status !== 'opening' && status !== 'verifying'

  // Seed a sensible default in the user's currency once it's resolved
  // (₦2,000 for Nigeria, ~$10 worth elsewhere) — unless they've typed.
  const touched = useRef(false)
  useEffect(() => {
    if (touched.current) return
    setAmount(cur.isNgn ? '2000' : String(Math.round(cur.toLocal(10))))
  }, [cur.isNgn, cur.ready])

  function addFunds() {
    if (!canPay || !session) return
    setError(null)
    setStatus('opening')

    // Nothing is recorded yet — we don't know if the user will pay. We only
    // create the deposit once ALATPay fires onTransaction (below). Metadata
    // carries the user id so a later webhook can attribute the payment too.
    const p = profile.data
    const pay = UseALATPay({
      amount: chargeAmount,
      currency: chargeCurrency,
      apiKey: API_KEY,
      businessId: BUSINESS_ID,
      email: email || 'user@lovemeet.app',
      firstName: p?.first_name ?? p?.display_name ?? 'Love',
      lastName: p?.last_name ?? 'Meet',
      phone: '',
      metadata: session.user.id,
      color: undefined,
      onClose: () => {
        // Closed without a transaction → user cancelled. Record nothing.
        setStatus((s) => (s === 'opening' ? 'cancelled' : s))
      },
      onTransaction: async (response: unknown) => {
        const tx = parseAlatpay(response)
        // No success and no reference → treat as not paid; record nothing.
        if (!tx.completed && !tx.transactionId) {
          setStatus('idle')
          setError('Payment was not completed.')
          return
        }
        // Always settle a paid user — fall back to a unique ref if ALATPay
        // didn't surface a transaction id in the client callback.
        const ref = tx.transactionId ?? `alatpay-${session.user.id}-${Date.now()}`
        setStatus('verifying')
        try {
          const dep = await record.mutateAsync({
            transactionId: ref,
            amountUsd: usd,              // recorded to the wallet (base)
            amountLocal: localAmount,    // what the user saw
            currencyLocal: cur.code,
            completed: tx.completed,
            payload: response,
          })
          if (dep.status === 'paid') {
            setStatus('done')
            window.setTimeout(() => navigate('/wallet'), 1200)
          } else {
            setStatus('idle')
            setError('Payment is processing — once it clears your wallet will update. Contact support if it doesn’t.')
          }
        } catch (e) {
          setError((e as Error).message)
          setStatus('idle')
        }
      },
    })
    pay.submit()
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
          <div className="flex-1 text-center text-ink font-bold">Add funds</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {!configured && (
          <div className="glass rounded-2xl p-3 text-sm text-danger border border-danger/30">
            Payments aren't configured yet. Set <span className="font-mono">VITE_ALATPAY_BUSINESS_ID</span> and{' '}
            <span className="font-mono">VITE_ALATPAY_API_KEY</span> in <span className="font-mono">.env.local</span>.
          </div>
        )}

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            Amount ({cur.code})
          </h2>
          <div className="glass rounded-2xl px-4 py-3 flex items-center gap-1 focus-within:ring-brand transition-shadow">
            <input
              type="number"
              inputMode="decimal"
              min={minLocal}
              value={amount}
              onChange={(e) => { touched.current = true; setAmount(e.target.value) }}
              className="flex-1 bg-transparent outline-none text-center text-2xl font-extrabold text-ink"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {presetLocals.map((v) => (
              <button
                key={v}
                onClick={() => { touched.current = true; setAmount(String(Math.round(v))) }}
                className={[
                  'px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors',
                  Math.round(localAmount) === Math.round(v) ? 'bg-gradient-brand text-white glow-rose' : 'glass text-ink-2 hover:text-ink',
                ].join(' ')}
              >
                {cur.formatLocal(v)}
              </button>
            ))}
          </div>
          {/* Non-Nigerians are charged in USD (their bank converts from the
              card currency); show the USD figure. Nigerians pay in ₦ directly. */}
          {!cur.isNgn && usd > 0 && (
            <p className="text-xs text-ink-muted mt-2">
              Charged as <span className="text-ink-2 font-semibold">${usd.toFixed(2)}</span> (USD) via ALATPay ·
              rates are indicative.
            </p>
          )}
          {localAmount > 0 && !meetsMin && (
            <p className="text-xs text-danger mt-2">Minimum is {cur.formatLocal(minLocal)}.</p>
          )}
        </section>

        <section className="glass rounded-2xl p-4">
          <p className="text-sm text-ink-2">
            Pay securely with <span className="font-semibold text-ink">ALATPay</span> — card, bank
            transfer, USSD, or bank details. {cur.isNgn
              ? 'Paid in Naira;'
              : 'Charged in USD;'} your wallet is credited once payment is confirmed.
          </p>
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}
        {status === 'done' && (
          <p className="text-sm text-success">✓ Payment confirmed — taking you to your wallet…</p>
        )}
        {status === 'cancelled' && (
          <p className="text-sm text-ink-muted">Payment cancelled. You can try again anytime.</p>
        )}

        <button
          onClick={addFunds}
          disabled={!canPay}
          className={[
            'w-full rounded-full py-3 text-sm font-bold transition-opacity',
            canPay ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
          ].join(' ')}
        >
          {status === 'opening' ? 'Opening checkout…'
            : status === 'verifying' ? 'Confirming payment…'
            : cur.isNgn ? `Add ${cur.formatLocal(localAmount)}` : `Add $${usd.toFixed(2)}`}
        </button>

        {/* History */}
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            Recent deposits
          </h2>
          {deposits.status === 'pending' && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-12 animate-pulse" />
              ))}
            </div>
          )}
          <ul className="space-y-1.5">
            {(deposits.data?.pages.flat() ?? []).map((d) => (
              <li key={d.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-base shrink-0">💳</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">
                    {cur.format(d.amount_usdt)}
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">
                    {d.provider} · {new Date(d.created_at).toLocaleString()}
                  </div>
                </div>
                <StatusPill status={d.status} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

/** Pull the transaction id + success flag out of ALATPay's onTransaction
 *  payload. Per ALATPay's docs, success is the BOOLEAN `response.status === true`
 *  (not a "completed" string). We also tolerate the nested `Value.Data` shape
 *  the webhook uses, in case the popup mirrors it. */
function parseAlatpay(response: unknown): { transactionId: string | null; completed: boolean } {
  if (!response || typeof response !== 'object') return { transactionId: null, completed: false }
  const r = response as Record<string, unknown>
  const value = (r.Value ?? r.value ?? {}) as Record<string, unknown>
  const d = (r.data ?? r.Data ?? value.Data ?? value.data ?? r) as Record<string, unknown>
  const customer = (d.Customer ?? d.customer ?? {}) as Record<string, unknown>

  const id =
    d.Id ?? d.id ?? d.transactionId ?? d.TransactionId ??
    customer.TransactionId ?? customer.transactionId ?? r.transactionId
  // Primary success signal (ALATPay docs): boolean `status === true`.
  // Fall back to a string status of completed/success for safety.
  const boolOk = r.status === true || value.Status === true || r.Status === true
  const strStatus = String(d.Status ?? d.status ?? '').toLowerCase()
  const completed = boolOk || strStatus === 'completed' || strStatus === 'success' || strStatus === 'successful'

  return { transactionId: id ? String(id) : null, completed }
}

function StatusPill({ status }: { status: Deposit['status'] }) {
  const map: Record<Deposit['status'], string> = {
    pending: 'bg-gold/15 text-gold',
    paid: 'bg-success/15 text-success',
    failed: 'bg-danger/15 text-danger',
    cancelled: 'bg-ink-muted/15 text-ink-muted',
  }
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${map[status]}`}>
      {status}
    </span>
  )
}
