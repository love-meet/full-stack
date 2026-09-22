import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './lib/telegram'
import { initAuth } from './stores/auth'
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

  // No automatic handoff into Telegram any more.
  //
  // This used to try to bounce every web visitor straight into the Mini App on
  // arrival, with a banner as the fallback. That made sense when the website
  // was a second way into the same app. It is now a brochure: its job is to
  // let someone read about Love meet and decide. Yanking them into Telegram
  // before they have read a word is the opposite of that, and the banner's
  // "continue on web" offered something that no longer exists.
  //
  // The landing page has an explicit "Open in Telegram" button. That is the
  // handoff, under a tap, where it belongs.

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
