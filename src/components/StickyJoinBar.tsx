import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { openInTelegramNow } from '../lib/telegramRedirect'
import { TelegramLogo } from './BrandIcons'

/**
 * The way in, always within reach.
 *
 * The only working door used to be the hero button and then the download
 * cards at the very bottom of the page — so anyone who started reading had
 * to scroll all the way to the end to join, or scroll all the way back up.
 * That is the single most expensive kind of friction on a landing page:
 * somebody convinced halfway down has nowhere to act on it.
 *
 * So once the hero button is out of view, this takes its place. It hides
 * again at the foot of the page, where the three download cards are already
 * on screen and a floating duplicate would just cover them.
 *
 * Bottom rather than top: it is within thumb reach on a phone, and it does
 * not fight the browser chrome.
 */
export default function StickyJoinBar() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      const atBottom =
        window.innerHeight + y >= document.body.scrollHeight - 520
      // 420px is roughly where the hero CTA leaves the viewport.
      setShow(y > 420 && !atBottom)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pointer-events-none"
        >
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={() => void openInTelegramNow()}
              className="w-full rounded-full px-6 py-3.5 bg-gradient-brand text-white font-extrabold glow-rose shadow-2xl flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
            >
              <TelegramLogo className="w-5 h-5" />
              Open in Telegram
            </button>
            <p className="mt-1.5 text-center text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              Free · 18+ · No password
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
