// Lightweight inline line-icons (lucide-style) so we don't pull a whole
// icon library. Stroke uses currentColor, so they tint with text-* classes.

type IconProps = { className?: string; size?: number; strokeWidth?: number }

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

/** Chevron-left — a back affordance that actually reads as "back". */
export function IconBack({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/** Speech bubble for comments. */
export function IconComment({ className, size = 19, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

/** Paper-plane "send/share" — fits sharing to Telegram. */
export function IconShare({ className, size = 19, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  )
}

/** Three-dots menu (vertical). */
export function IconMore({ className, size = 20, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  )
}

/** Stacked photos — open library. */
export function IconImages({ className, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <rect x="8" y="2" width="14" height="14" rx="2.5" />
      <circle cx="12.5" cy="6.5" r="1.4" />
      <path d="M22 12l-3.3-3.3a2 2 0 0 0-2.8 0L9 16" />
      <path d="M16 22H4a2 2 0 0 1-2-2V8" />
    </svg>
  )
}

/** Bell — notifications. */
export function IconBell({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** Envelope — messages / chats. */
export function IconMail({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

/** Magnifier — search. */
export function IconSearch({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

/** Video camera — marks a video post. */
export function IconVideo({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <rect x="2" y="6" width="14" height="12" rx="2.5" />
      <path d="M22 8.5 16 12l6 3.5v-7z" />
    </svg>
  )
}

/** Filled play triangle — centered video affordance. */
export function IconPlay({ className, size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/** Camera with circular arrows — flip front/back. */
export function IconFlipCamera({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M3 7h3l1.2-2h7.6L16 7h3a1 1 0 0 1 1 1v2" />
      <path d="M21 14v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6" />
      <path d="M9 11l-2 2 2 2" />
      <path d="M7 13h5.5a2.5 2.5 0 0 0 2.5-2.5" />
    </svg>
  )
}

/** Lightning bolt — flash / torch. */
export function IconFlash({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

/** Rule-of-thirds grid. */
export function IconGrid({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  )
}

/** Clock — self-timer. */
export function IconTimer({ className, size = 22, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className} aria-hidden>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </svg>
  )
}
