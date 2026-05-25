// Telegram Mini-App init. Safe to call on the web — does nothing when
// window.Telegram.WebApp is absent.

import { getSurface } from './surface'

/**
 * Push the app's top bars below Telegram's overlay controls (Close/⋯) and the
 * device status bar. In fullscreen, Telegram exposes safeAreaInset (device
 * notch) + contentSafeAreaInset (its own controls); we expose their sum as the
 * CSS var --lm-top-inset, never less than the browser's env() notch.
 */
function applyInsets(): void {
  const wa = window.Telegram?.WebApp
  if (!wa) return
  const top = (wa.safeAreaInset?.top ?? 0) + (wa.contentSafeAreaInset?.top ?? 0)
  document.documentElement.style.setProperty(
    '--lm-top-inset',
    `max(env(safe-area-inset-top), ${top}px)`,
  )
}

export function initTelegram(): void {
  if (getSurface() !== 'telegram') return
  const wa = window.Telegram?.WebApp
  if (!wa) return
  wa.ready?.()
  wa.expand?.()

  // Drop out of Telegram's fullscreen so it shows its standard windowed header
  // (which reserves space) instead of overlaying Close/⋯ over our top bar.
  // This is the layout that already works when launched via the Open button.
  try { wa.exitFullscreen?.() } catch { /* not in fullscreen / old client */ }

  applyInsets()
  // Re-apply when Telegram resizes, toggles fullscreen, or the insets change.
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) {
    try { wa.onEvent?.(ev, applyInsets) } catch { /* older clients */ }
  }
}
