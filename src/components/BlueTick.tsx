/** Blue verified tick — shown next to a user wherever they appear when they're
 *  a paying subscriber. */
export default function BlueTick({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Verified" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="11" fill="#1D9BF6" />
      <path d="M16.8 9.2l-6 6L7.2 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
