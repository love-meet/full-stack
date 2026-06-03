import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type Props = {
  /** Screen name shown next to the brand mark. */
  title: string
  /** Right-aligned slot — usually <TopIcons />. */
  right?: ReactNode
}

/**
 * Single-line screen header. Logo + screen title on the left, icons on the
 * right — same layout as the Feed's top bar so every primary screen reads the
 * same.
 *
 * Sticky at the top of the scroll container, with a translucent glass
 * background and a hair border so it reads cleanly over any content beneath.
 * Top padding reserves space for Telegram's fullscreen overlay (Close + ⋯)
 * via `--lm-top-inset`; that variable is set by `initTelegram()` on launch.
 */
export default function ScreenHeader({ title, right }: Props) {
  return (
    <header
      className="sticky top-0 z-20 glass border-b border-white/5"
      style={{ paddingTop: 'var(--lm-top-inset)' }}
    >
      <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/feed" className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="" className="h-7 w-auto shrink-0" />
          <span className="font-extrabold tracking-tight text-ink text-lg truncate">
            {title}
          </span>
        </Link>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  )
}
