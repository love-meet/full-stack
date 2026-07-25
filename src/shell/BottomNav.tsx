import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { getNavItems, type NavItem } from './navItems'
import { useProfile } from '../hooks/useProfile'
import { avatarFor } from '../lib/avatar'
import { useUi } from '../stores/ui'

export default function BottomNav() {
  const { t } = useTranslation()
  const profile = useProfile()
  const avatarUrl = avatarFor(profile.data)
  const drawerOpen = useUi((s) => s.drawerCount > 0)
  const navItems = getNavItems(t)

  // Hide while a drawer is open so the sheet's bottom composer isn't covered.
  if (drawerOpen) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 lg:hidden glass"
      style={{ paddingBottom: 'var(--lm-bottom-inset)' }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch h-16 px-2 gap-1">
        {navItems.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.to === '/feed'}
              className="relative flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-semibold uppercase tracking-wider"
            >
              {({ isActive }) => {
                if (item.kind === 'profile') {
                  return <ProfileButton active={isActive} avatarUrl={avatarUrl} label={item.label} />
                }
                return <TabIcon item={item} active={isActive} />
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function TabIcon({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <motion.span
      animate={{ scale: active ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      className={[
        'flex flex-col items-center gap-0.5',
        active ? 'text-ink' : 'text-ink-muted',
      ].join(' ')}
    >
      <span className="text-xl leading-none">{item.glyph}</span>
      <span className={active ? 'text-rose' : ''}>{item.label}</span>
      <span
        className={[
          'w-1 h-1 rounded-full mt-0.5 transition-opacity',
          active ? 'bg-rose opacity-100' : 'opacity-0',
        ].join(' ')}
      />
    </motion.span>
  )
}

function ProfileButton({ active, avatarUrl, label }: { active: boolean; avatarUrl: string; label: string }) {
  return (
    <motion.span
      animate={{ scale: active ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      className="flex flex-col items-center gap-0.5"
    >
      <span
        className={[
          'p-0.5 rounded-full transition-colors',
          active ? 'bg-gradient-brand glow-rose' : 'bg-transparent',
        ].join(' ')}
      >
        <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
      </span>
      <span
        className={[
          'text-[10px] font-semibold uppercase tracking-wider',
          active ? 'text-rose' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </span>
    </motion.span>
  )
}
