import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotifPermission, requestNotificationPermission } from '../hooks/useBrowserNotifications'

/**
 * Browser notifications are required for the live messaging experience. If the
 * user hasn't granted them, nudge with a banner. 'default' can be re-prompted;
 * 'denied' has to be changed in the browser's site settings.
 */
export default function NotifPermissionBanner() {
  const { t } = useTranslation()
  const permission = useNotifPermission((s) => s.permission)
  const [hidden, setHidden] = useState(false)

  if (hidden) return null
  if (permission === 'granted' || permission === 'unsupported') return null

  const denied = permission === 'denied'

  return (
    <div className="sticky top-0 z-30 bg-gradient-brand text-white text-sm">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-lg shrink-0">🔔</span>
        <p className="flex-1 leading-snug">
          {denied ? t('banners.notifDenied') : t('banners.notifDefault')}
        </p>
        {denied ? (
          <button
            onClick={() => setHidden(true)}
            className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 font-semibold"
          >
            {t('banners.notifGotIt')}
          </button>
        ) : (
          <button
            onClick={() => requestNotificationPermission()}
            className="shrink-0 rounded-full bg-white text-rose px-3 py-1.5 font-bold"
          >
            {t('banners.notifEnable')}
          </button>
        )}
      </div>
    </div>
  )
}
