// Telegram Mini-App init. Safe to call on the web — does nothing when
// window.Telegram.WebApp is absent.

import { getSurface } from './surface'

export function initTelegram(): void {
  if (getSurface() !== 'telegram') return
  const wa = window.Telegram?.WebApp
  if (!wa) return
  wa.ready?.()
  wa.expand?.()
}
