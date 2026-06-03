// Telegram Mini-App init. Safe to call on the web — does nothing when
// window.Telegram.WebApp is absent.

import { getSurface } from './surface'

/**
 * Push the app's top + bottom bars clear of Telegram's overlay controls
 * (Close/⋯ at the top, swipe handle at the bottom) and the device notch /
 * gesture area. In fullscreen, Telegram exposes safeAreaInset (device notch)
 * + contentSafeAreaInset (its own controls); we expose their sums as the CSS
 * vars --lm-top-inset and --lm-bottom-inset, never less than the browser's
 * env() values, and never less than a 14px floor on the bottom so Android's
 * system gesture nav doesn't sit flush against our tab bar.
 */
function applyInsets(): void {
  const wa = window.Telegram?.WebApp
  if (!wa) return
  const top = (wa.safeAreaInset?.top ?? 0) + (wa.contentSafeAreaInset?.top ?? 0)
  const bottom = (wa.safeAreaInset?.bottom ?? 0) + (wa.contentSafeAreaInset?.bottom ?? 0)
  document.documentElement.style.setProperty(
    '--lm-top-inset',
    `max(env(safe-area-inset-top), ${top}px)`,
  )
  document.documentElement.style.setProperty(
    '--lm-bottom-inset',
    `max(env(safe-area-inset-bottom), ${bottom}px, 14px)`,
  )
}

export function initTelegram(): void {
  if (getSurface() !== 'telegram') return
  const wa = window.Telegram?.WebApp
  if (!wa) return
  wa.ready?.()
  wa.expand?.()

  // Force fullscreen — the Mini App is Love meet's primary surface and benefits
  // from the full viewport (no Telegram header eating the top). Every screen
  // already pads its top bar with `var(--lm-top-inset)` so the Close/⋯ overlay
  // doesn't overlap content. Requires Bot API 8.0+ (Oct 2024); older clients
  // silently no-op and stay in windowed mode.
  try { wa.requestFullscreen?.() } catch { /* older clients */ }

  // Block the swipe-down-to-minimize gesture. Without this, a user scrolling
  // up too far at the top of a feed accidentally dismisses the Mini App
  // mid-session. They can still exit via Telegram's Close (✕) button in the
  // overlay — but accidental swipes won't kill the session. Bot API 7.7+.
  try { wa.disableVerticalSwipes?.() } catch { /* older clients */ }

  applyInsets()
  // Re-apply when Telegram resizes, toggles fullscreen, or the insets change.
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) {
    try { wa.onEvent?.(ev, applyInsets) } catch { /* older clients */ }
  }

  // If anything exits fullscreen mid-session (a user gesture, an OS event,
  // a Telegram dialog), re-enter it after a short delay so the app stays in
  // its intended layout. The Close (✕) button still closes the app entirely
  // and the fullscreenChanged event won't fire there — no infinite loop.
  try {
    wa.onEvent?.('fullscreenChanged', () => {
      if (wa.isFullscreen === false) {
        setTimeout(() => { try { wa.requestFullscreen?.() } catch { /* ignore */ } }, 120)
      }
    })
  } catch { /* older clients */ }
}
