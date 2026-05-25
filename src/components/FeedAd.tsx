import { useEffect, useState } from 'react'

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
  return <AdsterraBanner unitKey={KEY_320x50} w={320} h={50} />
}

/** Desktop sidebar skyscraper (160x600). Renders nothing until its key is set. */
export function SidebarAd() {
  if (!KEY_160x600) return null
  return <AdsterraBanner unitKey={KEY_160x600} w={160} h={600} />
}
