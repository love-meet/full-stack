// Detects which surface the app is running on.
// Telegram Mini-App exposes window.Telegram.WebApp with a non-empty initData
// when launched from a bot; outside Telegram, that object is absent.

export type Surface = 'telegram' | 'web'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: unknown
        ready?: () => void
        expand?: () => void
        platform?: string
      }
    }
  }
}

export function getSurface(): Surface {
  if (typeof window === 'undefined') return 'web'
  const tg = window.Telegram?.WebApp
  if (tg && typeof tg.initData === 'string' && tg.initData.length > 0) {
    return 'telegram'
  }
  return 'web'
}
