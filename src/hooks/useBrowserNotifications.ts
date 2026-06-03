import { useEffect } from 'react'
import { create } from 'zustand'

type PermState = NotificationPermission | 'unsupported'

type Store = {
  permission: PermState
  setPermission: (p: PermState) => void
}

const supported = typeof window !== 'undefined' && 'Notification' in window

export const useNotifPermission = create<Store>((set) => ({
  permission: supported ? Notification.permission : 'unsupported',
  setPermission: (permission) => set({ permission }),
}))

/** Ask the browser for notification permission. Returns the resulting state. */
export async function requestNotificationPermission(): Promise<PermState> {
  if (!supported) return 'unsupported'
  try {
    const p = await Notification.requestPermission()
    useNotifPermission.getState().setPermission(p)
    return p
  } catch {
    return Notification.permission
  }
}

/**
 * Mount once (Shell). Asks for notification permission on load, and keeps the
 * store in sync. Browser notifications are required for the live messaging
 * experience; if the user has denied them we surface a banner (see Shell).
 */
export function useEnsureBrowserNotifications() {
  const setPermission = useNotifPermission((s) => s.setPermission)
  useEffect(() => {
    if (!supported) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    // Only the browser can show the prompt, and only on 'default'. Fire it
    // once on load; 'denied' can't be re-prompted (user must use site settings).
    if (Notification.permission === 'default') {
      void requestNotificationPermission()
    }
  }, [setPermission])
}

/**
 * Show an OS/browser notification if we're allowed to. No-ops otherwise.
 * `iconUrl` (optional) — when set, used as the notification icon so users
 * see the actor's avatar instead of the generic Love-meet favicon.
 */
export function showBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
  iconUrl?: string | null,
) {
  if (!supported || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      icon: iconUrl || '/favicon-32x32.png',
      badge: '/favicon-32x32.png',
      tag: 'love-meet-message', // collapse rapid pings into one
    })
    if (onClick) {
      n.onclick = () => {
        window.focus()
        onClick()
        n.close()
      }
    }
  } catch {
    // Some engines throw if constructed without a service worker — ignore.
  }
}
