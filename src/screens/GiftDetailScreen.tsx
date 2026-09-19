import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGift } from '../hooks/useGift'
import { useAuth } from '../stores/auth'

export default function GiftDetailScreen() {
  const { giftId } = useParams<{ giftId: string }>()
  const navigate = useNavigate()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const gift = useGift(giftId)

  const g = gift.data
  const iAmRecipient = !!g && g.recipient_id === myId
  const iAmSender = !!g && g.sender_id === myId
  const senderLabel = g?.sender?.handle ? `@${g.sender.handle}` : g?.sender?.display_name ?? 'Someone'
  const recipientLabel = g?.recipient?.handle ? `@${g.recipient.handle}` : g?.recipient?.display_name ?? 'them'

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
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

          </motion.div>
        )}
      </main>
    </div>
  )
}

function StatusPill({ status }: { status: GiftDetailStatus }) {
  const map = {
    sent:     { label: 'Sent 🎁',  cls: 'bg-success/15 text-success' },
    rejected: { label: 'Declined', cls: 'bg-rose/15 text-rose' },
  } as const
  const m = map[status]
  if (!m) return null
  return (
    <div className="mt-4">
      <span className={`inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${m.cls}`}>
        {m.label}
      </span>
    </div>
  )
}

type GiftDetailStatus = 'sent' | 'rejected'
