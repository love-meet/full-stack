import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UseALATPay from 'react-alatpay'
import {
  useCredits,
  useCreditHistory,
  useCreditsRealtime,
  useRecordCreditPurchase,
  creditLabel,
  creditNote,
  creditGlyph,
  CREDITS_PER_USD,
  DAILY_MESSAGE_COST,
  type CreditEntry,
} from '../../hooks/useCredits'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../stores/auth'

const BUSINESS_ID = import.meta.env.VITE_ALATPAY_BUSINESS_ID as string | undefined
const API_KEY = import.meta.env.VITE_ALATPAY_API_KEY as string | undefined

/** The one pack: $2 = 2,000 credits = 20 active chatting days. */
const PACK_USD = 2

/**
 * Credits — balance, what they're for, how to get more, and the history.
 *
 * §6: this lives in Profile, and there is no money language anywhere. Credits
 * are not a balance, not a wallet, not earnings. They buy messaging and
 * nothing else, they cannot be cashed out, and games never touch them.
 */
export default function CreditsScreen() {
  const navigate = useNavigate()
  const balance = useCredits()
  const history = useCreditHistory()
  const record = useRecordCreditPurchase()
  const profile = useProfile()
  const session = useAuth((s) => s.session)
  useCreditsRealtime()

  const [status, setStatus] = useState<'idle' | 'opening' | 'verifying' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const configured = !!BUSINESS_ID && !!API_KEY
  const credits = balance.data ?? 0
  const days = Math.floor(credits / DAILY_MESSAGE_COST)
  const entries: CreditEntry[] = history.data?.pages.flat() ?? []

  function buy() {
    if (!configured || !session || status === 'opening' || status === 'verifying') return
    setError(null)
    setStatus('opening')
    const p = profile.data
    const checkout = UseALATPay({
      amount: PACK_USD,
      currency: 'USD',
      apiKey: API_KEY,
      businessId: BUSINESS_ID,
      email: session.user.email || 'user@lovemeet.app',
      firstName: p?.first_name ?? p?.display_name ?? 'Love',
      lastName: p?.last_name ?? 'Meet',
      phone: '',
      metadata: session.user.id,
      color: undefined,
      onClose: () => setStatus((s) => (s === 'opening' ? 'idle' : s)),
      onTransaction: async (response: unknown) => {
        const tx = parseAlatpay(response)
        if (!tx.completed && !tx.transactionId) {
          setStatus('idle')
          setError('That payment did not go through.')
          return
        }
        setStatus('verifying')
        try {
          // Idempotent on the transaction id server-side, so a retry or a
          // later webhook for the same payment cannot credit twice.
          await record.mutateAsync({
            transactionId: tx.transactionId ?? `alatpay-${session.user.id}-${Date.now()}`,
            amountUsd: PACK_USD,
            completed: tx.completed,
            payload: response,
          })
          setStatus(tx.completed ? 'done' : 'idle')
          if (!tx.completed) {
            setError('Payment is still processing — your coins will land once it clears.')
          }
        } catch (e) {
          setError((e as Error).message)
          setStatus('idle')
        }
      },
    })
    checkout.submit()
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Coins</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* Balance */}
        <section className="glass rounded-3xl p-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
            Your coins
          </div>
          {balance.isPending ? (
            <div className="mt-3 mx-auto h-10 w-40 rounded-lg bg-white/10 animate-pulse" />
          ) : (
            <div className="mt-2 text-5xl font-extrabold text-gradient-warm tabular-nums">
              {credits.toLocaleString()}
            </div>
          )}
          <p className="mt-2 text-sm text-ink-2">
            {days > 0
              ? `About ${days} more ${days === 1 ? 'day' : 'days'} of messaging.`
              : 'Not enough for another day of messaging.'}
          </p>
        </section>

        {/* How it works — plainly, so nobody has to guess what they're paying for. */}
        <section className="glass rounded-2xl p-5 space-y-2 text-sm text-ink-2">
          <p>
            <b className="text-ink">{DAILY_MESSAGE_COST} coins</b> covers the first message
            you send on any day. After that, message as much as you like, in every
            chat, until the day rolls over.
          </p>
          <p>A day you don't message costs nothing. Coins never expire.</p>
          <p><b className="text-ink">Games are free.</b> They cost nothing to play and pay nothing out.</p>
        </section>

        {/* Buy */}
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            Get more
          </h2>
          <div className="glass rounded-2xl p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-extrabold text-gradient-warm">
                  {(PACK_USD * CREDITS_PER_USD).toLocaleString()} coins
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {Math.floor((PACK_USD * CREDITS_PER_USD) / DAILY_MESSAGE_COST)} days of messaging
                </div>
              </div>
              <div className="text-2xl font-extrabold text-ink">${PACK_USD}</div>
            </div>

            <button
              onClick={buy}
              disabled={!configured || status === 'opening' || status === 'verifying'}
              className="mt-4 w-full rounded-full py-3 bg-gradient-brand text-white font-extrabold text-sm glow-rose disabled:opacity-60"
            >
              {status === 'opening' ? 'Opening…'
                : status === 'verifying' ? 'Confirming…'
                : status === 'done' ? '✓ Added'
                : `Get ${(PACK_USD * CREDITS_PER_USD).toLocaleString()} coins`}
            </button>

            {!configured && (
              <p className="mt-3 text-xs text-ink-muted text-center">
                Payments aren't configured on this build yet.
              </p>
            )}
            {error && <p className="mt-3 text-xs text-danger text-center">{error}</p>}

            <p className="mt-3 text-[11px] text-ink-muted text-center">
              Coins buy messaging inside Love meet. They have no cash value and
              can't be transferred or exchanged.
            </p>
          </div>
        </section>

        {/* History */}
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            History
          </h2>

          {history.status === 'pending' && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-14 animate-pulse" />
              ))}
            </div>
          )}

          {history.status === 'success' && entries.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-sm text-ink-muted">
              Nothing yet.
            </div>
          )}

          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <span
                  className={[
                    'w-9 h-9 rounded-full grid place-items-center shrink-0 text-base',
                    e.delta >= 0 ? 'bg-success/15 text-success' : 'bg-white/8 text-ink-2',
                  ].join(' ')}
                >
                  {creditGlyph(e.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">
                    {creditLabel(e.kind, e.note)}
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">
                    {creditNote(e.kind, e.note) ?? new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <div
                  className={[
                    'shrink-0 text-sm font-bold tabular-nums',
                    e.delta >= 0 ? 'text-success' : 'text-ink-2',
                  ].join(' ')}
                >
                  {e.delta >= 0 ? '+' : '−'}{Math.abs(e.delta).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>

          {history.hasNextPage && (
            <button
              onClick={() => history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
              className="mt-4 w-full glass rounded-full py-3 text-sm text-ink-2 hover:text-ink font-semibold"
            >
              {history.isFetchingNextPage ? 'Loading…' : 'Show older'}
            </button>
          )}
        </section>
      </main>
    </div>
  )
}

/** Pull transactionId + success out of whatever shape ALATPay hands back. */
function parseAlatpay(response: unknown): { transactionId: string | null; completed: boolean } {
  const r = (response ?? {}) as Record<string, unknown>
  const data = (r.data ?? r) as Record<string, unknown>
  const id =
    (data.transactionId as string | undefined) ??
    (data.transaction_id as string | undefined) ??
    (data.id as string | undefined) ??
    null
  const status = String(
    (data.status as string | undefined) ?? (r.status as string | undefined) ?? '',
  ).toLowerCase()
  return {
    transactionId: id,
    completed: status === 'completed' || status === 'success' || status === 'paid',
  }
}
