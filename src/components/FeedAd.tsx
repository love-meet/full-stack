// Adsterra in-feed banner. Each ad renders inside its own sandboxed iframe so
// multiple instances down the feed don't collide (the Adsterra invoke script
// targets the document it runs in).
//
// The key + size below match the Banner unit created in the Adsterra
// publisher dashboard. The key is a PUBLIC client value (it's in the ad script
// every visitor downloads), so it's fine to ship. To swap the unit later,
// override via Netlify env vars without code changes.

const KEY = (import.meta.env.VITE_ADSTERRA_BANNER_KEY as string | undefined)
  || '1eeb5db8e869a87a5cd959b0d4402b18'
const W = Number(import.meta.env.VITE_ADSTERRA_BANNER_W) || 320
const H = Number(import.meta.env.VITE_ADSTERRA_BANNER_H) || 50

export default function FeedAd() {
  if (!KEY) return null

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;display:grid;place-items:center;height:100%;overflow:hidden}</style>
</head><body>
<script type="text/javascript">
  atOptions = { 'key' : '${KEY}', 'format' : 'iframe', 'height' : ${H}, 'width' : ${W}, 'params' : {} };
</script>
<script type="text/javascript" src="//www.highperformanceformat.com/${KEY}/invoke.js"></script>
</body></html>`

  return (
    <iframe
      title="Sponsored"
      srcDoc={srcDoc}
      width={W}
      height={H}
      style={{ border: 0, width: W, height: H, background: 'transparent' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  )
}
