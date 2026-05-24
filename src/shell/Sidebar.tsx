import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV_ITEMS } from './navItems'
import { useProfile } from '../hooks/useProfile'
import { avatarFor } from '../lib/avatar'

export default function Sidebar() {
  const profile = useProfile()
  const avatarUrl = avatarFor(profile.data)
  const displayName =
    profile.data?.handle ?? profile.data?.display_name ?? 'you'

  return (
    <aside
      className="hidden lg:flex flex-col w-64 shrink-0 glass border-r border-white/5 px-4 py-6 gap-1 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto"
      aria-label="Primary"
    >
      <div className="flex items-center gap-2 px-3 pb-8">
        <img src="/logo.png" alt="" className="h-10 w-auto" />
        <span className="text-2xl font-extrabold tracking-tight text-gradient-warm">
          Meet
        </span>
      </div>

      <nav>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/feed'}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    item.kind === 'post'
                      ? 'bg-gradient-brand text-white glow-rose'
                      : isActive
                        ? 'text-white'
                        : 'text-ink-2 hover:text-ink',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {item.kind !== 'post' && isActive && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-gradient-brand glow-rose"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    {item.kind === 'profile' ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="relative w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <span className="relative text-lg leading-none">{item.glyph}</span>
                    )}
                    <span className="relative">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto px-3 pt-6 text-[10px] text-ink-muted">
        @{displayName}
      </div>
    </aside>
  )
}
