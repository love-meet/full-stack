import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useIsAdmin } from '../../hooks/useAdmin'

const TABS = [
  { to: '/admin',              label: 'Dashboard',   end: true },
  { to: '/admin/moderation',   label: 'Moderation' },
  { to: '/admin/support',      label: 'Support' },
  { to: '/admin/users',        label: 'Users' },
  { to: '/admin/payouts',      label: 'Payouts' },
  { to: '/admin/transactions', label: 'Transactions' },
] as const

/**
 * Shell wrapping every /admin/* route. Gates on role — non-admins get
 * bounced back to /feed.
 */
export default function AdminLayout() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return <Navigate to="/feed" replace />

  return (
    <div className="min-h-full pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3">
          <h1 className="text-2xl font-extrabold text-gradient-warm">Admin</h1>
          <p className="text-xs text-ink-muted">
            Moderation, user management, payouts.
          </p>
        </div>

        <nav className="max-w-5xl mx-auto px-2 sm:px-4 mt-2 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end ?? false}
              className={({ isActive }) =>
                [
                  'relative shrink-0 px-3 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span>{t.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="admin-active-tab"
                      className="absolute -bottom-0.5 inset-x-2 h-0.5 rounded-full bg-gradient-brand"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
