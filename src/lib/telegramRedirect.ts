// Telegram-first redirect helper.
//
// Love meet's primary surface is the Telegram Mini App. When a user lands on
// lovemeetapp.com from a browser, we attempt to hand them off into Telegram.
// If Telegram isn't installed (or the OS / browser refuses the scheme), the
// web app loads as the fallback — never an error page, never the t.me/install
// landing.
//
// Three rules of engagement:
//   1. Inside Telegram WebApp already → never redirect (we're home).
//   2. User explicitly opts out (banner ✕ button, or `?web=1` on the URL)
//      → never redirect, persistently.
//   3. Search engines / preview bots → never redirect (SEO + link previews).
//
// Flow:
//   • main.tsx calls attemptTelegramRedirect() before React mounts.
//   • If conditions allow, we try `tg://resolve?domain=<bot>&...`. Telegram
//     installed → OS catches it, Telegram opens, our page goes background.
//   • After ~1.5s of staying visible, we resolve the promise as "didn't
//     switch" → main.tsx flips the banner store on so a sticky bar appears
//     offering manual handoff (which works on iOS Safari under a user
//     gesture, unlike the silent attempt).

import { getSurface } from './surface'

const BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? ''
// Telegram short names are 5–32 chars, alphanumeric + underscore only. Anything
// else (display names like "Love Meet", values containing spaces or punctuation)
// is treated as "no named Mini App configured" and the redirect falls through
// to the bot's Main Mini App pattern — which is what you want for bots that
// use BotFather's "Configure Mini App" rather than `/newapp`.
const MINI_APP_RAW = (import.meta.env.VITE_TELEGRAM_MINI_APP_NAME as string | undefined) ?? ''
const MINI_APP_NAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(MINI_APP_RAW.trim())
  ? MINI_APP_RAW.trim()
  : ''
const OPT_OUT_KEY = 'lm-prefer-web'
const SESSION_TRIED_KEY = 'lm-tried-tg-redirect'
const REDIRECT_TIMEOUT_MS = 1500

const BOT_UA_RE =
  /bot|crawler|spider|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|facebookexternalhit|whatsapp|twitterbot|linkedinbot|skype|telegrambot/i

export function isInTelegram(): boolean {
  return getSurface() === 'telegram'
}

export function hasOptedOutOfTelegram(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1' } catch { return false }
}

export function setOptedOutOfTelegram(v: boolean): void {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch { /* private mode etc. — silently no-op */ }
}

/** Banner is meaningful only if redirect *could* work and user hasn't opted out. */
export function canShowTelegramBanner(): boolean {
  if (typeof window === 'undefined') return false
  if (!BOT_USERNAME) return false
  if (isInTelegram()) return false
  if (hasOptedOutOfTelegram()) return false
  if (BOT_UA_RE.test(navigator.userAgent)) return false
  return true
}

function canAttemptSilentRedirect(): boolean {
  if (!canShowTelegramBanner()) return false
  try {
    if (new URL(window.location.href).searchParams.get('web') === '1') return false
    if (sessionStorage.getItem(SESSION_TRIED_KEY) === '1') return false
  } catch { return false }
  return true
}

function buildDeepLinks(path: string): { scheme: string; universal: string } {
  // start_param max is 64 chars and only alphanumeric/_/-. Encode the path
  // (so `/feed?ref=LM-X` survives) then trim to fit.
  const start = encodeURIComponent(path.replace(/^\//, '')).slice(0, 60)
  if (MINI_APP_NAME) {
    // Named Mini App (created with `/newapp` in BotFather, has a short name).
    return {
      scheme: `tg://resolve?domain=${BOT_USERNAME}&appname=${MINI_APP_NAME}&startapp=${start}`,
      universal: `https://t.me/${BOT_USERNAME}/${MINI_APP_NAME}?startapp=${start}`,
    }
  }
  // Main Mini App (Bot Settings → Configure Mini App, no short name).
  // `startapp` (not `start`) is the parameter that opens the Mini App
  // directly; `start` would just send /start to the bot's chat.
  return {
    scheme: `tg://resolve?domain=${BOT_USERNAME}&startapp=${start}`,
    universal: `https://t.me/${BOT_USERNAME}?startapp=${start}`,
  }
}

/**
 * Attempt to hand off to Telegram. Resolves true if Telegram took over (page
 * became hidden during the attempt), false otherwise. Never throws — failure
 * always falls through to the web app.
 */
export function attemptTelegramRedirect(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!canAttemptSilentRedirect()) return resolve(false)

    try { sessionStorage.setItem(SESSION_TRIED_KEY, '1') } catch { /* ignore */ }

    const { scheme } = buildDeepLinks(window.location.pathname + window.location.search)

    let switched = false
    const onVis = () => {
      if (document.visibilityState === 'hidden') switched = true
    }
    document.addEventListener('visibilitychange', onVis)

    // Trigger the deep link. On Android Chrome / Telegram Desktop this opens
    // Telegram cleanly. On iOS Safari it often no-ops without a user gesture
    // (which is why the banner exists — tapping it counts as a user gesture
    // and the manual handoff works).
    try { window.location.href = scheme } catch { /* swallow */ }

    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis)
      resolve(switched || document.visibilityState === 'hidden')
    }, REDIRECT_TIMEOUT_MS)
  })
}

/**
 * User-gesture handoff (called from the banner button). Uses the universal
 * `https://t.me/...` form which iOS / Android treat as an Universal / App
 * Link — Telegram opens if installed, otherwise Telegram's web preview shows.
 * Under a user gesture this is reliable on every platform.
 */
export function openInTelegramNow(): void {
  if (!BOT_USERNAME) return
  const { universal } = buildDeepLinks(window.location.pathname + window.location.search)
  window.location.href = universal
}
