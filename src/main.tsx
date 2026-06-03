import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './lib/telegram'
import { initAuth } from './stores/auth'
import { attemptTelegramRedirect, canShowTelegramBanner } from './lib/telegramRedirect'
import { useTelegramBanner } from './stores/telegramBanner'

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
