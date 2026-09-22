/**
 * Marks and icons for the website.
 *
 * No emoji here, deliberately. An emoji is a font glyph: it renders as a
 * different picture on Windows, macOS, Android and Telegram's own webview, it
 * carries its own colours that fight the palette, and the platform logos have
 * to be the real marks — a paper-plane emoji is not the Telegram logo, and
 * using it on a download button reads as a counterfeit.
 *
 * The feature icons are stroked line art on a shared 24-unit grid so they sit
 * at one optical weight, the same system as the feed rail.
 */

type IconProps = { className?: string }

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// ── Platform marks (solid, drawn from the official geometry) ───────────────

export function TelegramLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

export function AppleLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.81 3.15-.46 7.81 1.3 10.37.86 1.25 1.89 2.66 3.24 2.61 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.14M14.5 4.75c.71-.87 1.2-2.07 1.06-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.04-1.45" />
    </svg>
  )
}

/**
 * Google Play, in its own four colours.
 *
 * Flat fills rather than the official gradients: at 24px the gradients are
 * indistinguishable, and gradient <defs> need unique ids per instance —
 * rendering the mark twice on one page with a shared id makes the second copy
 * inherit the first's stops. Flat colours cannot collide.
 */
export function PlayLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3.18 1.68A2 2 0 0 0 3 2.5v19a2 2 0 0 0 .18.82L13.6 12 3.18 1.68Z" fill="#00A0FF" />
      <path d="M17.09 8.51 4.78 1.53c-.54-.31-1.18-.25-1.6.15L13.6 12l3.49-3.49Z" fill="#00E676" />
      <path d="m17.09 15.49-3.49-3.49 3.49-3.49 4.14 2.36c.94.54.94 1.72 0 2.26l-4.14 2.36Z" fill="#FFCE00" />
      <path d="M17.09 15.49 13.6 12 3.18 22.32c.42.4 1.06.46 1.6.15l12.31-6.98Z" fill="#FF3A44" />
    </svg>
  )
}

/** Telegram's own blue. Their mark, their colour. */
export const TELEGRAM_BLUE = '#26A5E1'

// ── Feature icons ──────────────────────────────────────────────────────────

/** A feed of people — one face filling the frame. */
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.2 18.4a5 5 0 0 1 9.6 0" />
    </svg>
  )
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <path d="M21 11.6c0 4.2-4 7.6-9 7.6a10 10 0 0 1-2.9-.4L4 21l1.3-3.7A7.2 7.2 0 0 1 3 11.6C3 7.4 7 4 12 4s9 3.4 9 7.6Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth="2.4" />
    </svg>
  )
}

/** Games — a board, since ours are turn-based board and word games. */
export function GameIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.4" />
      <path d="M9.1 3.2v17.6M14.9 3.2v17.6M3.2 9.1h17.6M3.2 14.9h17.6" />
    </svg>
  )
}

export function GiftBoxIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <path d="M4 11.5h16v8.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8Z" />
      <path d="M3.2 7.6h17.6v3.9H3.2zM12 7.6v12.9" />
      <path d="M12 7.6S10.9 3 8.6 3a2.3 2.3 0 0 0 0 4.6ZM12 7.6S13.1 3 15.4 3a2.3 2.3 0 0 1 0 4.6Z" />
    </svg>
  )
}

/** Friends — two people, because it takes both. */
export function FriendsIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.4a6 6 0 0 1 12 0" />
      <path d="M16.2 5.2a3.2 3.2 0 0 1 0 5.7M18 14.2a6 6 0 0 1 3 5.2" />
    </svg>
  )
}

/** Credits — a spark, not a coin. They are not money and must not look it. */
export function SparkIcon({ className }: IconProps) {
  return (
    <svg {...stroke} className={className} aria-hidden>
      <path d="M12 2.8 13.9 9l6.2 1.9-6.2 1.9L12 19l-1.9-6.2L3.9 10.9 10.1 9Z" />
      <path d="M18.6 3.2 19.3 5.4l2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7Z" />
    </svg>
  )
}
