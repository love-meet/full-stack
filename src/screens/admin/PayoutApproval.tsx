import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useApproveWithdrawal,
  useMarkDepositPaid,
  useMarkWithdrawalSent,
  usePendingDeposits,
  usePendingWithdrawals,
  useRejectWithdrawal,
} from '../../hooks/useAdmin'
import type { Deposit, WithdrawalRequest } from '../../hooks/usePayments'

export default function PayoutApproval() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
          Pending deposits
        </h2>
        <DepositsList />
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
          Pending withdrawals
        </h2>
        <WithdrawalsList />
      </section>
    </div>
  )
}

function DepositsList() {
  const list = usePendingDeposits()
  const mark = useMarkDepositPaid()

  async function pay(d: Deposit) {
    if (!window.confirm(`Mark ₦${d.amount_usdt.toLocaleString()} deposit as paid?`)) return
    try {
      await mark.mutateAsync({ depositId: d.id })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (list.status === 'success' && list.data.length === 0) {
    return <div className="glass rounded-2xl p-6 text-sm text-ink-muted text-center">No pending deposits.</div>
  }

  return (
    <ul className="space-y-2">
      {list.data?.map((d) => (
        <li key={d.id} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-base">💰</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink">
                ₦{d.amount_usdt.toLocaleString()}
                {d.amount_local != null && d.currency_local && d.currency_local !== 'NGN' && (
                  <span className="text-ink-muted ml-2 font-normal">
                    ≈ {d.amount_local.toLocaleString()} {d.currency_local}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-muted truncate">
                {d.provider} · LM-{d.id.slice(0, 8).toUpperCase()} ·{' '}
                <Link
                  to={`/profile/${d.user_id}`}
                  target="_blank"
                  className="text-rose hover:underline"
                >
                  {d.user_id.slice(0, 8)}
                </Link>
                {' · '}
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => pay(d)}
              disabled={mark.isPending}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold bg-success text-white"
            >
              Mark paid
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function WithdrawalsList() {
  const list = usePendingWithdrawals()
  const approve = useApproveWithdrawal()
  const markSent = useMarkWithdrawalSent()
  const reject = useRejectWithdrawal()

  async function doApprove(w: WithdrawalRequest) {
    try { await approve.mutateAsync(w.id) }
    catch (e) { alert((e as Error).message) }
  }
  async function doMarkSent(w: WithdrawalRequest) {
    const hash = window.prompt('Bank transfer reference / receipt:')
    if (!hash) return
    try { await markSent.mutateAsync({ reqId: w.id, txHash: hash }) }
    catch (e) { alert((e as Error).message) }
  }
  async function doReject(w: WithdrawalRequest) {
    const reason = window.prompt('Reason for rejection (will be visible to the user):')
    if (reason == null) return
    try { await reject.mutateAsync({ reqId: w.id, reason }) }
    catch (e) { alert((e as Error).message) }
  }

  if (list.status === 'success' && list.data.length === 0) {
    return <div className="glass rounded-2xl p-6 text-sm text-ink-muted text-center">No pending withdrawals.</div>
  }

  return (
    <ul className="space-y-2">
      {list.data?.map((w) => (
        <li key={w.id} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-base">⬆</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink">
                {w.payout_amount_local != null
                  ? `${w.payout_currency ?? ''} ${w.payout_amount_local.toLocaleString()}`.trim()
                  : `$${w.amount_usdt.toLocaleString()}`}
                <span className="text-ink-muted font-normal ml-2">(${w.amount_usdt.toLocaleString()})</span>
                <span
                  className={[
                    'ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                    w.status === 'pending' ? 'bg-gold/15 text-gold' : 'bg-coral/15 text-coral',
                  ].join(' ')}
                >
                  {w.status}
                </span>
              </div>
              <div className="text-[11px] text-ink-2 break-all mt-0.5">
                🏦 {w.destination}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                <Link
                  to={`/profile/${w.user_id}`}
                  target="_blank"
                  className="text-rose hover:underline"
                >
                  {w.user_id.slice(0, 8)}
                </Link>
                {' · '}
                {new Date(w.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2 text-xs">
            <button
              onClick={() => doReject(w)}
              className="rounded-full px-3 py-1 glass text-danger hover:bg-danger/10 font-semibold"
            >
              Reject
            </button>
            {w.status === 'pending' && (
              <button
                onClick={() => doApprove(w)}
                className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
              >
                Approve
              </button>
            )}
            <button
              onClick={() => doMarkSent(w)}
              className="rounded-full px-3 py-1 bg-success text-white font-bold"
            >
              Mark sent
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
