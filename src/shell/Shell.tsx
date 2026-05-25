import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
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
          'flex-1 overflow-x-hidden',
          immersive ? 'pb-0' : 'pb-16 lg:pb-0',
        ].join(' ')}
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
      {!immersive && <BottomNav />}
    </div>
  )
}
