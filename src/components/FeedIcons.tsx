/**
 * The feed rail's icons.
 *
 * Stroked line art, not emoji. Emoji render differently on every device — an
 * Android heart and an iOS heart are not the same picture — and they cannot be
 * filled on tap, which is the whole visual language of a like button. These
 * are single paths at a common 24-unit viewBox so they sit on the same optical
 * weight, and they take `filled` where the active state is a fill rather than
 * a colour change.
 */

type IconProps = { filled?: boolean; className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function HeartIcon({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path d="M12 20.5 4.2 12.9a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.8 4.8 0 0 1 0 6.8Z" />
    </svg>
  )
}

/** Reject. A plain cross — not a "no entry", which reads as a punishment. */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.2} aria-hidden>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  )
}

export function CommentIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M21 11.6c0 4.2-4 7.6-9 7.6a10 10 0 0 1-2.9-.4L4 21l1.3-3.7A7.2 7.2 0 0 1 3 11.6C3 7.4 7 4 12 4s9 3.4 9 7.6Z" />
    </svg>
  )
}

export function BookmarkIcon({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path d="M6 4.8h12a.8.8 0 0 1 .8.8v14.1l-6.8-4.3-6.8 4.3V5.6a.8.8 0 0 1 .8-.8Z" />
    </svg>
  )
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M21.4 3.1 2.9 9.6a.6.6 0 0 0 0 1.1l7.5 2.6 2.6 7.5a.6.6 0 0 0 1.1 0Z" />
      <path d="M10.4 13.3 21.4 3.1" />
    </svg>
  )
}

export function GiftIcon({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path d="M4 11.5h16v8.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8Z" />
      <path d="M3.2 7.6h17.6v3.9H3.2zM12 7.6v12.9" />
      <path d="M12 7.6S10.9 3 8.6 3a2.3 2.3 0 0 0 0 4.6ZM12 7.6S13.1 3 15.4 3a2.3 2.3 0 0 1 0 4.6Z" />
    </svg>
  )
}

export function PhotosIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M7.6 3.5h12.1a.8.8 0 0 1 .8.8v12.1a.8.8 0 0 1-.8.8H7.6a.8.8 0 0 1-.8-.8V4.3a.8.8 0 0 1 .8-.8Z" />
      <path d="M4 7v12.7a.8.8 0 0 0 .8.8h12.7" />
      <path d="m8 13.6 2.8-2.8 3.2 3.2 2.1-2.1 2.4 2.4" />
    </svg>
  )
}

export function MutedIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19Z" />
      <path d="m16.5 9.5 5 5m0-5-5 5" />
    </svg>
  )
}

export function SoundIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19Z" />
      <path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M18.2 5.8a8.8 8.8 0 0 1 0 12.4" />
    </svg>
  )
}

