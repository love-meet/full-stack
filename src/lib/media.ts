/** Media and count helpers shared by the feed. */

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i

/**
 * Is this URL a video?
 *
 * Galleries are plain `text[]` — nothing records the media type — so the
 * extension is all there is to go on. Every surface used to assume photos and
 * render an `<img>`, which is why videos showed as a frozen first frame.
 */
export function isVideoUrl(src: string | null | undefined): boolean {
  return !!src && VIDEO_RE.test(src)
}

/** 1 → "1", 1200 → "1.2K", 95800 → "95.8K", 2400000 → "2.4M". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`
  }
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}
