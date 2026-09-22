// Detects which surface the app is running on.
// Telegram Mini-App exposes window.Telegram.WebApp with a non-empty initData
// when launched from a bot; outside Telegram, that object is absent.

export type Surface = 'telegram' | 'web'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: { start_param?: string; [k: string]: unknown }
        ready?: () => void
        expand?: () => void
        platform?: string
        isExpanded?: boolean
        // Bot API 8.0+ safe areas (present in newer Telegram clients).
        safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number }
        contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number }
        onEvent?: (event: string, cb: () => void) => void
        requestFullscreen?: () => void
        exitFullscreen?: () => void
        isFullscreen?: boolean
        // Bot API 7.7+ — swipe-down-to-minimize gesture controls. Disabling
        // prevents accidental closure when scrolling feeds / chats.
        disableVerticalSwipes?: () => void
        enableVerticalSwipes?: () => void
        isVerticalSwipesEnabled?: boolean
        // Bot API 6.2+ — Telegram-native confirm popup. Far more reliable
        // than window.confirm inside fullscreen Mini Apps, where the
        // browser's native dialog can render behind the canvas.
        showConfirm?: (message: string, callback?: (ok: boolean) => void) => void
        showAlert?: (message: string, callback?: () => void) => void
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

/**
 * Does the app itself run on this surface?
 *
 * The website is a brochure — it describes Love meet and points at Telegram,
 * it does not run it. There is no sign-in on the web and no feed, chat, games
 * or credits. Everything behind RequireAppSurface is gated on this.
 *
 * Read once, at module load, rather than per render: the Telegram SDK is a
 * synchronous <script> in <head>, so this is already settled by the time any
 * module runs, and a value that cannot change mid-session cannot flip a
 * signed-in user out of the app.
 *
 * `import.meta.env.DEV` keeps `npm run dev` usable on a laptop. Vite compiles
 * it to a literal `false` in production builds, so a visitor cannot reach it.
 */
const APP_RUNS_HERE = import.meta.env.DEV || getSurface() === 'telegram'

export function appRunsHere(): boolean {
  return APP_RUNS_HERE
}
