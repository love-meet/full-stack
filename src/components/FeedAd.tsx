import { useEffect, useState } from 'react'
import { useMySubscription } from '../hooks/usePayments'

// Adsterra ad units. Each ad renders in its own sandboxed iframe so multiple
// instances don't collide (the invoke script targets the document it runs in).
// Keys are PUBLIC client values (they ship in the ad script), so they're safe
// to embed. Each size is a separate unit/key from the Adsterra dashboard;
// override via Netlify env vars without code changes.
//
// TODO: paste the 728x90 and 160x600 keys (GET CODE → the 'key' string) below
// or set VITE_ADSTERRA_728x90 / VITE_ADSTERRA_160x600 in Netlify.

const KEY_320x50  = (import.meta.env.VITE_ADSTERRA_320x50 as string | undefined)  || '1eeb5db8e869a87a5cd959b0d4402b18'
const KEY_728x90  = (import.meta.env.VITE_ADSTERRA_728x90 as string | undefined)  || '9e485555f453c6799fffa62edb74ec80'
const KEY_160x600 = (import.meta.env.VITE_ADSTERRA_160x600 as string | undefined) || 'd31ff0d7fba6180ea5c3c316f2165700'
// Medium Rectangle (300x250) — fills a mobile feed card far better than the
// thin 320x50. Create this unit in Adsterra and paste its key (or set
// VITE_ADSTERRA_300x250). Until then, mobile falls back to the 320x50.
const KEY_300x250 = (import.meta.env.VITE_ADSTERRA_300x250 as string | undefined) || ''

/** A single Adsterra banner of a given size, sandboxed in an iframe. */
function AdsterraBanner({ unitKey, w, h }: { unitKey: string; w: number; h: number }) {
  if (!unitKey) return null
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;display:grid;place-items:center;height:100%;overflow:hidden}</style>
</head><body>
<script type="text/javascript">
  atOptions = { 'key' : '${unitKey}', 'format' : 'iframe', 'height' : ${h}, 'width' : ${w}, 'params' : {} };
</script>
<script type="text/javascript" src="//www.highperformanceformat.com/${unitKey}/invoke.js"></script>
</body></html>`
  return (
    <iframe
      title="Sponsored"
      srcDoc={srcDoc}
      width={w}
      height={h}
      style={{ border: 0, width: w, height: h, maxWidth: '100%', background: 'transparent' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  )
}

/** True once the viewport is at least `px` wide (re-evaluates on resize). */
function useMinWidth(px: number): boolean {
  const [match, setMatch] = useState(
    typeof window !== 'undefined' ? window.matchMedia(`(min-width:${px}px)`).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${px}px)`)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [px])
  return match
}

/** In-feed sponsored banner: a wide leaderboard on desktop, a small banner on
 *  mobile (falls back to the mobile unit if the desktop key isn't set yet). */
export default function FeedAd() {
  const wide = useMinWidth(768)
  if (wide && KEY_728x90) return <AdsterraBanner unitKey={KEY_728x90} w={728} h={90} />
  // Mobile: prefer the 300x250 rectangle (fills the card); else the 320x50.
  if (KEY_300x250) return <AdsterraBanner unitKey={KEY_300x250} w={300} h={250} />
  return <AdsterraBanner unitKey={KEY_320x50} w={320} h={50} />
}

/** Desktop sidebar skyscraper (160x600). Renders nothing until its key is set. */
export function SidebarAd() {
  if (!KEY_160x600) return null
  return <AdsterraBanner unitKey={KEY_160x600} w={160} h={600} />
}

/**
 * A framed "Sponsored" banner for inline placement (comment lists, threads).
 * Free users only — subscribers see nothing. Uses the same responsive unit
 * as the feed.
 */
export function InlineAd() {
  const isSubscriber = !!useMySubscription().data
  if (isSubscriber) return null
  return (
    <div className="my-3 glass rounded-2xl px-3 py-3 flex flex-col items-center gap-2">
      <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
        Sponsored
      </span>
      <FeedAd />
    </div>
  )
}

// ── Whole-page script ads (Popunder, Social Bar) ─────────────────────────
// Adsterra "Popunder" and "Social Bar" units are single <script src> tags
// that hook the whole page (popunder triggers on the next click, social bar
// renders its own floating widget). We inject them ONCE per page-load for
// non-subscribers, and leave them mounted across route changes.

// TODO: paste the Popunder unit's "Get Code" src here, or set
// VITE_ADSTERRA_POPUNDER_SRC in Netlify. Leaving it empty no-ops the popunder.
const POPUNDER_SRC =
  (import.meta.env.VITE_ADSTERRA_POPUNDER_SRC as string | undefined) || ''

function useScriptAd(src: string, flagKey: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !src) return
    const w = window as unknown as Record<string, boolean>
    if (w[flagKey]) return
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.adsterra = flagKey
    document.body.appendChild(s)
    w[flagKey] = true
    // These scripts mount global page widgets — leaving them across route
    // changes is fine and avoids duplicate loads.
  }, [enabled, src, flagKey])
}

/** Adsterra Popunder — fires on the user's next click anywhere on the page.
 *  Mount it on screens where popunder is allowed (games). Non-subscribers only. */
export function PopunderAd() {
  const isSubscriber = !!useMySubscription().data
  useScriptAd(POPUNDER_SRC, '__lm_popunder', !isSubscriber)
  return null
}

