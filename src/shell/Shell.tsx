import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import ConversationRail from './ConversationRail'
import NotifPermissionBanner from './NotifPermissionBanner'
import { usePresenceInit } from '../hooks/usePresenceInit'
import { useEnsureBrowserNotifications } from '../hooks/useBrowserNotifications'
import { useIncomingMessageAlerts } from '../hooks/useIncomingMessageAlerts'

// Routes that take over the whole mobile viewport — no bottom nav, no main
// padding-bottom for the nav. Sidebar still shows on desktop.
const IMMERSIVE_ROUTES = ['/post', '/p']

export default function Shell() {
  const location = useLocation()
  const outlet = useOutlet()
  usePresenceInit()
  useEnsureBrowserNotifications()
  useIncomingMessageAlerts()

  const immersive = IMMERSIVE_ROUTES.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  )

  return (
    <div className="min-h-screen flex flex-col lg:flex-row text-ink">
      <Sidebar />
      <main
        className={[
          // overflow-x-clip (not hidden): hidden forces overflow-y to `auto`,
          // making this a scroll container and breaking the sticky headers on
          // the settings/secondary screens. clip prevents sideways scroll
          // without hijacking the vertical axis, so those headers pin to top.
          'flex-1 overflow-x-clip',
          immersive ? 'pb-0' : 'lg:pb-0',
        ].join(' ')}
        // Bottom padding covers the 4rem nav row PLUS the system safe-area
        // inset (Android gesture nav, iPhone home indicator) so content never
        // scrolls behind the system controls.
        style={!immersive ? { paddingBottom: 'calc(4rem + var(--lm-bottom-inset))' } : undefined}
      >
        <NotifPermissionBanner />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      {/* Right rail (xl+): persistent conversations panel. Its presence shrinks
          `main`, centering the main content between the two rails. */}
      <ConversationRail />
      {!immersive && <BottomNav />}
    </div>
  )
}
