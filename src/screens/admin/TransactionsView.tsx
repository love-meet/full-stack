import { useAdminLedger } from '../../hooks/useAdmin'
import type { LedgerEntry } from '../../hooks/useWallet'

export default function TransactionsView() {
  const ledger = useAdminLedger()

  return (
    <div>
      {ledger.status === 'pending' && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-12 animate-pulse" />
          ))}
        </div>
      )}

      {ledger.status === 'success' && ledger.data.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-ink-muted text-sm">
          No ledger entries yet.
        </div>
      )}

      <ul className="space-y-1.5">
        {(ledger.data as LedgerEntry[] | undefined)?.map((e) => (
          <li
            key={e.id}
            className="glass rounded-2xl px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-3"
          >
            <span
              className={[
                'w-8 h-8 rounded-full grid place-items-center text-sm',
                e.direction === 'credit' ? 'bg-success/15 text-success' : 'bg-rose/15 text-rose',
              ].join(' ')}
            >
              {e.direction === 'credit' ? '+' : '−'}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate">
                {e.kind} · {e.user_id.slice(0, 8)}…
              </div>
              <div className="text-[11px] text-ink-muted truncate">
                {e.note ?? `${e.ref_table ?? '—'} ${e.ref_id?.slice(0, 8) ?? ''}`}
                {' · '}
                {new Date(e.created_at).toLocaleString()}
              </div>
            </div>
            <div
              className={[
                'text-sm font-bold tabular-nums',
                e.direction === 'credit' ? 'text-success' : 'text-rose',
              ].join(' ')}
            >
              {e.direction === 'credit' ? '+' : '−'}₦
              {Number(e.amount_usdt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
