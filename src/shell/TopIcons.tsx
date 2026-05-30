import { Link } from 'react-router-dom'
import { useUnreadNotifications, useNotificationsRealtime } from '../hooks/useNotifications'
import { useConversations } from '../hooks/useConversations'
import { IconBell, IconMail, IconSearch } from '../components/icons'

/**
 * Search · Notifications · Messages — the same three pill icons used on the
 * feed top bar. Drop this into any screen's header (e.g. ScreenHeader.right)
 * to get the same look + the same live unread badges everywhere.
 *
 * `tone` matches the surface: 'light' for transparent / dark backgrounds
 * (feed video overlay, in-game lobby), 'dark' for the regular app surface.
 */
export default function TopIcons({ tone = 'dark' }: { tone?: 'light' | 'dark' }) {
  useNotificationsRealtime()
  const unread = useUnreadNotifications().data ?? 0
  const unreadChats = (useConversations().data ?? []).filter((c) => c.unread_count > 0).length
  const color =
    tone === 'light' ? 'text-white/90 hover:text-white drop-shadow' : 'text-ink-2 hover:text-ink'
  return (
    <div className="flex items-center gap-1">
      <TopIcon to="/search" label="Search" icon={<IconSearch size={22} />} color={color} />
      <TopIcon to="/notifications" label="Notifications" icon={<IconBell size={22} />} badge={unread} color={color} />
      <TopIcon to="/chat" label="Chats" icon={<IconMail size={22} />} badge={unreadChats} color={color} />
    </div>
  )
}

function TopIcon({
  to, label, icon, badge, color,
}: {
  to: string; label: string; icon: React.ReactNode; badge?: number; color: string
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`relative w-10 h-10 grid place-items-center transition-colors ${color}`}
    >
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}
