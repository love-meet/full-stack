import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGift, useRespondGift } from '../hooks/useGift'
import { useUserCurrency } from '../hooks/useFx'
import { useAuth } from '../stores/auth'

export default function GiftDetailScreen() {
  const { giftId } = useParams<{ giftId: string }>()
  const navigate = useNavigate()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const gift = useGift(giftId)
  const respond = useRespondGift()
  const cur = useUserCurrency()
  const [error, setError] = useState<string | null>(null)

  const g = gift.data
  const amountUsd = g ? g.amount_cents / 100 : 0
  const price = cur.ready || cur.code === 'USD' ? cur.format(amountUsd) : `$${amountUsd}`
  const iAmRecipient = !!g && g.recipient_id === myId
  const iAmSender = !!g && g.sender_id === myId
  const senderLabel = g?.sender?.handle ? `@${g.sender.handle}` : g?.sender?.display_name ?? 'Someone'
  const recipientLabel = g?.recipient?.handle ? `@${g.recipient.handle}` : g?.recipient?.display_name ?? 'them'

  async function act(accept: boolean) {
    if (!giftId) return
    setError(null)
    try {
      await respond.mutateAsync({ giftId, accept })
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
          <div className="flex-1 text-center text-ink font-bold">Gift</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-8 py-8">
        {gift.status === 'pending' && <div className="glass rounded-3xl h-96 animate-pulse" />}

        {gift.status === 'success' && !g && (
          <div className="glass rounded-3xl p-10 text-center">
            <div className="text-4xl mb-3">🎁</div>
            <p className="text-ink font-semibold">Gift not found</p>
          </div>
        )}

        {g && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl p-6 text-center"
          >
            <div className="w-40 h-40 rounded-2xl mx-auto overflow-hidden bg-black glow-rose">
              {g.gift_image && <img src={g.gift_image} alt={g.gift_name} className="w-full h-full object-cover" />}
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-gradient-warm">{g.gift_name}</h1>
            <div className="mt-1 text-lg font-bold text-ink">{price}</div>

            <p className="mt-3 text-sm text-ink-2">
              {iAmRecipient ? (
                <>{senderLabel} sent you this gift.</>
              ) : iAmSender ? (
                <>You sent this to {recipientLabel}.</>
              ) : (
                <>{senderLabel} → {recipientLabel}</>
              )}
            </p>

            <StatusPill status={g.status} />

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            {/* Recipient action: accept / decline a pending gift. */}
            {iAmRecipient && g.status === 'pending' && (
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => act(true)}
                  disabled={respond.isPending}
                  className="w-full rounded-full py-3 text-sm font-bold bg-gradient-brand text-white glow-rose disabled:opacity-60"
                >
                  {respond.isPending ? 'Working…' : `Accept gift (${price})`}
                </button>
                <button
                  onClick={() => act(false)}
                  disabled={respond.isPending}
                  className="w-full rounded-full py-3 text-sm font-semibold glass text-ink-2 hover:text-ink disabled:opacity-60"
                >
                  Decline
                </button>
                <p className="text-[11px] text-ink-muted">
                  Accept and it's added to your earnings. Decline and {senderLabel} is refunded.
                </p>
              </div>
            )}

            {iAmRecipient && g.status === 'accepted' && (
              <Link to="/earnings" className="mt-6 inline-flex rounded-full px-6 py-3 bg-gradient-brand text-white text-sm font-bold glow-rose">
                View in earnings
              </Link>
            )}

            {iAmSender && (
              <Link to="/wallet" className="mt-6 inline-flex rounded-full px-6 py-3 glass text-ink-2 hover:text-ink text-sm font-semibold">
                View transaction
              </Link>
            )}
          </motion.div>
        )}
      </main>
    </div>
  )
}

function StatusPill({ status }: { status: GiftDetailStatus }) {
  const map = {
    pending:  { label: 'Pending',  cls: 'bg-gold/15 text-gold' },
    accepted: { label: 'Accepted 🎉', cls: 'bg-success/15 text-success' },
    rejected: { label: 'Declined', cls: 'bg-rose/15 text-rose' },
    failed:   { label: 'Failed',   cls: 'bg-rose/15 text-rose' },
  } as const
  const m = map[status]
  return (
    <div className="mt-4">
      <span className={`inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${m.cls}`}>
        {m.label}
      </span>
    </div>
  )
}

type GiftDetailStatus = 'pending' | 'accepted' | 'rejected' | 'failed'
