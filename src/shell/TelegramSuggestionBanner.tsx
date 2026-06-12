import { useTelegramBanner } from '../stores/telegramBanner'
import {
  canShowTelegramBanner,
  openInTelegramNow,
  setOptedOutOfTelegram,
} from '../lib/telegramRedirect'

/**
 * Telegram-first fallback banner. Shows when the silent redirect attempt
 * from main.tsx didn't switch the user into Telegram (most often: iOS Safari
 * without user gesture, or Telegram simply not installed). Mounted at app
 * root so it covers the landing page and authenticated routes alike.
 *
 * Position is `fixed` so it overlays without re-flowing the page layout.
 * Dismiss persists across visits via localStorage.
 */
export default function TelegramSuggestionBanner() {
  const visible = useTelegramBanner((s) => s.visible)
  const hide = useTelegramBanner((s) => s.hide)
  if (!visible || !canShowTelegramBanner()) return null

  function onContinueWeb() {
    setOptedOutOfTelegram(true)
    hide()
  }

  // openInTelegramNow is async (it fetches a link token for signed-in
  // users so Telegram opens into the SAME account, not a duplicate).
  // Fire-and-forget — the page navigates away on success.
  function onOpenTelegram() { void openInTelegramNow() }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-brand text-white text-sm shadow-md">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-lg shrink-0">💕</span>
        <p className="flex-1 leading-snug">
          Love meet works best in Telegram.
        </p>
        <button
          onClick={onOpenTelegram}
          className="shrink-0 rounded-full bg-white text-rose px-3 py-1.5 font-bold"
        >
          Open in Telegram
        </button>
        <button
          onClick={onContinueWeb}
          className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-1.5 font-semibold"
          aria-label="Continue on web"
          title="Continue on web"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
