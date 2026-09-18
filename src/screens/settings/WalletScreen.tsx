import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useLedger,
  useWalletRealtime,

  type LedgerEntry,
} from '../../hooks/useWallet'
import { useUserCurrency } from '../../hooks/useAmount'


// ---------------------------------------------------------------------------
// Transactions — a table of EVERY ledger movement, with a detail view.
// No balance card: this page is purely the transaction record.
// ---------------------------------------------------------------------------
export default function WalletScreen() {
  const navigate = useNavigate()
  const cur = useUserCurrency()
  const ledger = useLedger({})
  useWalletRealtime()

  const [detail, setDetail] = useState<LedgerEntry | null>(null)
  const entries: LedgerEntry[] = ledger.data?.pages.flat() ?? []

  return (
    <div className="min-h-screen text-ink pb-24">
      <Header title="Transactions" onBack={() => navigate(-1)} />

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <p className="text-sm text-ink-muted mb-4">
          Every credit and debit on your account.
          Tap a row for full details.
        </p>

        {ledger.status === 'pending' && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-xl h-12 animate-pulse" />
            ))}
          </div>
        )}

        {ledger.status === 'success' && entries.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-sm text-ink-muted">
            No transactions yet.
          </div>
        )}

        {entries.length > 0 && (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_auto] gap-2 px-4 py-2.5 border-b border-white/8 text-[10px] uppercase tracking-[0.16em] text-ink-muted font-bold">
              <span>Type</span>
              <span className="hidden sm:block">Date</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="divide-y divide-white/5">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setDetail(e)}
                    className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_auto] gap-2 items-center px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{iconFor(e.kind)}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink truncate">{labelFor(e.kind)}</span>
                          {e.gift_status && <GiftStatusBadge status={e.gift_status} />}
                        </span>
                        <span className="block sm:hidden text-[11px] text-ink-muted">{shortDate(e.created_at)}</span>
                      </span>
                    </span>
                    <span className="hidden sm:block text-[12px] text-ink-muted tabular-nums">{shortDate(e.created_at)}</span>
                    <span
                      className={[
                        'text-right text-sm font-bold tabular-nums',
                        e.direction === 'credit' ? 'text-success' : 'text-rose',
                      ].join(' ')}
                    >
                      {e.direction === 'credit' ? '+' : '−'}{cur.format(e.amount_usdt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ledger.hasNextPage && (
          <button
            onClick={() => ledger.fetchNextPage()}
            disabled={ledger.isFetchingNextPage}
            className="mt-4 w-full glass rounded-full py-3 text-sm text-ink-2 hover:text-ink font-semibold"
          >
            {ledger.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </button>
        )}
      </main>

      <AnimatePresence>
        {detail && <TxDetailSheet entry={detail} cur={cur} onClose={() => setDetail(null)} />}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// bits
// ---------------------------------------------------------------------------

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header
      className="sticky top-0 z-10 glass border-b border-white/5"
      style={{ paddingTop: 'var(--lm-top-inset)' }}
    >
      <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
        <button onClick={onBack} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
        <div className="flex-1 text-center text-ink font-bold">{title}</div>
        <div className="w-10" aria-hidden />
      </div>
    </header>
  )
}

function TxDetailSheet({
  entry, cur, onClose,
}: {
  entry: LedgerEntry
  cur: ReturnType<typeof useUserCurrency>
  onClose: () => void
}) {
  const credit = entry.direction === 'credit'
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-6 m-0 sm:m-4"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-ink flex items-center gap-2">
            <span className="text-xl">{iconFor(entry.kind)}</span>{labelFor(entry.kind)}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink text-xl px-1">✕</button>
        </div>

        <div className={`text-3xl font-extrabold tabular-nums mb-4 ${credit ? 'text-success' : 'text-rose'}`}>
          {credit ? '+' : '−'}{cur.format(entry.amount_usdt)}
        </div>

        <dl className="space-y-2.5 text-sm">
          <Row label="Direction" value={credit ? 'Credit (in)' : 'Debit (out)'} />
          <Row label="Date" value={new Date(entry.created_at).toLocaleString()} />
          <Row label="Reference" value={`LM-${entry.id.slice(0, 8).toUpperCase()}`} mono />
          {entry.ref_table && <Row label="Linked to" value={`${entry.ref_table}${entry.ref_id ? ` · ${entry.ref_id.slice(0, 8)}` : ''}`} mono />}
          {entry.gift_status && <Row label="Gift status" value={giftStatusLabel(entry.gift_status)} />}
          {entry.note && <Row label="Note" value={entry.note} />}
        </dl>
      </motion.div>
    </motion.div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-muted font-bold pt-0.5 shrink-0">{label}</dt>
      <dd className={`text-right text-ink ${mono ? 'font-mono text-[13px] break-all' : ''}`}>{value}</dd>
    </div>
  )
}

function giftStatusLabel(s: NonNullable<LedgerEntry['gift_status']>): string {
  switch (s) {
    case 'pending': return 'Pending'
    case 'accepted': return 'Accepted'
    case 'rejected': return 'Declined'
    case 'failed': return 'Failed'
  }
}

function GiftStatusBadge({ status }: { status: NonNullable<LedgerEntry['gift_status']> }) {
  const tone =
    status === 'accepted' ? 'bg-success/15 text-success'
    : status === 'rejected' ? 'bg-rose/15 text-rose'
    : status === 'failed' ? 'bg-rose/15 text-rose'
    : 'bg-gold/15 text-gold'
  return (
    <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tone}`}>
      {giftStatusLabel(status)}
    </span>
  )
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function iconFor(kind: LedgerEntry['kind']): string {
  switch (kind) {
    case 'gift_received': return '🎁'
    case 'gift_sent': return '🎁'
    case 'deposit': return '⬇'
    case 'adjustment': return '⚙'
  }
}

function labelFor(kind: LedgerEntry['kind']): string {
  switch (kind) {
    case 'gift_received': return 'Gift received'
    case 'gift_sent': return 'Gift sent'
    case 'deposit': return 'Payment received'
    case 'adjustment': return 'Adjustment'
  }
}
