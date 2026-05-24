import { Link } from 'react-router-dom'
import { useAdminStats } from '../../hooks/useAdmin'

export default function AdminDashboard() {
  const stats = useAdminStats()

  const cards = [
    { label: 'Open reports',      to: '/admin/moderation',   key: 'open_reports',     accent: 'rose' },
    { label: 'Open tickets',      to: '/admin/support',      key: 'open_tickets',     accent: 'gold' },
    { label: 'Pending payouts',   to: '/admin/payouts',      key: 'pending_payouts',  accent: 'coral' },
    { label: 'Pending deposits',  to: '/admin/payouts',      key: 'pending_deposits', accent: 'gold' },
    { label: 'Active bans',       to: '/admin/users',        key: 'active_bans',      accent: 'danger' },
    { label: 'Admins',            to: '/admin/users',        key: 'admin_count',      accent: 'magenta' },
    { label: 'Users',             to: '/admin/users',        key: 'user_count',       accent: 'success' },
  ] as const

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {cards.map((c) => {
        const value = stats.data ? (stats.data as Record<string, number>)[c.key] : null
        return (
          <Link
            key={c.label}
            to={c.to}
            className="glass rounded-2xl p-4 hover:bg-white/[0.04] transition-colors"
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
              {c.label}
            </div>
            <div className={`mt-2 text-3xl font-extrabold text-${c.accent}`}>
              {value ?? '—'}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
