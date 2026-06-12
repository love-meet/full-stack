import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './lib/telegram'
import { initAuth } from './stores/auth'
import { attemptTelegramRedirect, canShowTelegramBanner } from './lib/telegramRedirect'
import { useTelegramBanner } from './stores/telegramBanner'
import { supabase } from './lib/supabase'
import { getSurface } from './lib/surface'

/**
 * Cross-surface identity link. If this Mini App was opened from a web user
 * tapping "Open in Telegram" while signed in, the Telegram deep link's
 * start_param contains a LINK-XXXXXXXX token. We exchange it (plus the
 * Telegram initData) for a magic link that signs the user into their
 * EXISTING Love meet account — instead of letting the regular Telegram
 * auth flow create a brand-new duplicate.
 *
 * Returns true when we navigated to a magic link (caller should NOT mount
 * React; the page is about to change). Returns false in every other
 * case (no token, not in Telegram, link function failed) — the normal
 * Telegram sign-in flow then runs as usual.
 */
async function handleLinkTokenIfAny(): Promise<boolean> {
  if (getSurface() !== 'telegram') return false
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (!startParam || !/^LINK-[A-Za-z0-9]{6,32}$/.test(startParam)) return false
  const initData = window.Telegram?.WebApp?.initData
  if (!initData) return false

  try {
    const { data, error } = await supabase.functions.invoke<{ action_url?: string; error?: string }>(
      'link-telegram',
      { body: { link_token: startParam, initData } },
    )
    if (error || !data?.action_url) {
      // eslint-disable-next-line no-console
      console.warn('[link-telegram] failed, falling through to normal auth:', error ?? data?.error)
      return false
    }
    window.location.assign(data.action_url)
    return true
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[link-telegram] errored, falling through:', e)
    return false
  }
}

async function bootstrap() {
  // First, check whether this Mini App load is a linking handoff. If yes,
  // we navigate to the magic link and don't bother mounting React — the
  // page is changing anyway.
  if (await handleLinkTokenIfAny()) return

  initTelegram()
  initAuth()

  // Telegram-first handoff: try to switch the user into the Telegram Mini App
  // on first visit. If Telegram isn't installed (or the browser refuses the
  // scheme — common on iOS Safari without a user gesture), fall through to the
  // web app and surface the fallback banner that does the handoff under a tap.
  // Web app keeps loading in parallel — users never get stuck on a blank page.
  void attemptTelegramRedirect().then((switched) => {
    if (!switched && canShowTelegramBanner()) {
      useTelegramBanner.getState().show()
    }
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
