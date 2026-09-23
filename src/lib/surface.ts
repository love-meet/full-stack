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
 * Is `/` the app's front door, or the website's?
 *
 * Only Telegram. On the web, lovemeetapp.com is a brochure: it describes
 * Love meet and points at Telegram, it does not run it.
 *
 * Deliberately NOT true in dev. It was, and that made the brochure impossible
 * to look at on localhost — `/` rendered the sign-in screen instead, which is
 * the one page a developer is least likely to be working on. Reaching the app
 * locally is handled by `appRoutesAllowed()` below, which is a different
 * question from "what does the front page show".
 *
 * Read once at module load: the Telegram SDK is a synchronous <script> in
 * <head>, so this is settled before any module runs, and a value that cannot
 * change mid-session cannot flip a signed-in user out of the app.
 */
const IN_TELEGRAM = getSurface() === 'telegram'

export function appRunsHere(): boolean {
  return IN_TELEGRAM
}

/**
 * May the app's routes render at all on this surface?
 *
 * Telegram always; localhost too, so `npm run dev` can open /feed, /chat and
 * the rest without a Telegram client. Vite compiles `import.meta.env.DEV` to
 * a literal `false` in a production build, so a visitor cannot reach it.
 */
const APP_ROUTES_ALLOWED = IN_TELEGRAM || import.meta.env.DEV

export function appRoutesAllowed(): boolean {
  return APP_ROUTES_ALLOWED
}

/** True only on `npm run dev` — used to offer a local sign-in. */
export const IS_DEV = import.meta.env.DEV
