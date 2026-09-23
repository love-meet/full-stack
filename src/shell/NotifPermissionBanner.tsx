import { useState } from 'react'
import { useNotifPermission, requestNotificationPermission } from '../hooks/useBrowserNotifications'
import { getSurface } from '../lib/surface'

const DISMISSED = 'lm_notif_banner_dismissed'

function alreadyDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED) === '1' } catch { return false }
}

/**
 * Ask for notification permission — but only where asking makes sense.
 *
 * Two things were wrong with this banner.
 *
 * "Turn them on in your browser's site settings" is unactionable inside the
 * Telegram Mini-App: there is no settings UI the person can reach, and
 * Telegram controls its own notifications. Telling somebody to do something
 * they cannot do is worse than saying nothing, so the blocked variant is
 * suppressed there. The prompt variant still shows, because tapping it does
 * work when the webview supports it.
 *
 * And "Got it" did not stick — it was component state, so the banner came
 * back on the next screen and kept coming back for ever. A dismissal the user
 * has to repeat is nagging, which is how a permission ask gets denied
 * permanently out of irritation.
 */
export default function NotifPermissionBanner() {
  const permission = useNotifPermission((s) => s.permission)
  const [hidden, setHidden] = useState(alreadyDismissed)

  function dismiss() {
    setHidden(true)
    try { localStorage.setItem(DISMISSED, '1') } catch { /* session-only then */ }
  }

  if (hidden) return null
  if (permission === 'granted' || permission === 'unsupported') return null

  const denied = permission === 'denied'

  // Nothing useful to say about a blocked permission inside Telegram.
  if (denied && getSurface() === 'telegram') return null

  return (
    <div className="sticky top-0 z-30 bg-gradient-brand text-white text-sm">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-lg shrink-0">🔔</span>
        <p className="flex-1 leading-snug">
          {denied ? (
            <>Notifications are blocked. Turn them on in your browser's site settings so you never miss a message.</>
          ) : (
            <>Turn on notifications so you never miss a message.</>
          )}
        </p>
        {denied ? (
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 font-semibold"
          >
            Got it
          </button>
        ) : (
          <>
            <button
              onClick={() => requestNotificationPermission()}
              className="shrink-0 rounded-full bg-white text-rose px-3 py-1.5 font-bold"
            >
              Turn on
            </button>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 grid place-items-center"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
