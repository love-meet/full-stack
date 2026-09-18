import { Link } from 'react-router-dom'
import { useAdminStats } from '../../hooks/useAdmin'
import { useAdsEnabled, useSetAdsEnabled, useAdSettingsRealtime } from '../../hooks/useAds'

export default function AdminDashboard() {
  const stats = useAdminStats()

  const cards = [
    { label: 'Open reports',      to: '/admin/moderation',   key: 'open_reports',     accent: 'rose' },
    { label: 'Open tickets',      to: '/admin/support',      key: 'open_tickets',     accent: 'gold' },
    { label: 'Pending deposits',  to: '/admin/transactions', key: 'pending_deposits', accent: 'gold' },
    { label: 'Active bans',       to: '/admin/users',        key: 'active_bans',      accent: 'danger' },
    { label: 'Admins',            to: '/admin/users',        key: 'admin_count',      accent: 'magenta' },
    { label: 'Users',             to: '/admin/users',        key: 'user_count',       accent: 'success' },
  ] as const

  return (
    <div className="space-y-6">
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

      <AdsSwitch />
    </div>
  )
}

/**
 * The ad kill switch (§7).
 *
 * Ads run for everyone, always, independent of credits — this is the only
 * thing that turns them off, and it takes effect everywhere immediately
 * rather than waiting on a deploy.
 */
function AdsSwitch() {
  const enabled = useAdsEnabled()
  const set = useSetAdsEnabled()
  useAdSettingsRealtime()

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Ads</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {enabled
              ? 'Running for every user, on every surface.'
              : 'Off everywhere. No sponsored cards, no banners.'}
          </p>
        </div>
        <button
          onClick={() => set.mutate(!enabled)}
          disabled={set.isPending}
          role="switch"
          aria-checked={enabled}
          aria-label="Ads enabled"
          className={[
            'relative w-14 h-8 rounded-full shrink-0 transition-colors disabled:opacity-60',
            enabled ? 'bg-gradient-brand glow-rose' : 'bg-white/15',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-1 w-6 h-6 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-7' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>
      {set.error && (
        <p className="mt-3 text-xs text-danger">{(set.error as Error).message}</p>
      )}
    </section>
  )
}
