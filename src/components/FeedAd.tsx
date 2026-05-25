// Adsterra in-feed banner. Each ad renders inside its own sandboxed iframe so
// multiple instances down the feed don't collide (the Adsterra invoke script
// targets the document it runs in).
//
// Setup: create a "Banner 300x250" ad unit in your Adsterra publisher
// dashboard, copy its key, and set it as VITE_ADSTERRA_BANNER_KEY in Netlify's
// env vars (and lm-app/.env for local). Until it's set, nothing renders.

const KEY = import.meta.env.VITE_ADSTERRA_BANNER_KEY as string | undefined

export default function FeedAd() {
  if (!KEY) return null

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;display:grid;place-items:center;height:100%;overflow:hidden}</style>
</head><body>
<script type="text/javascript">
  atOptions = { 'key' : '${KEY}', 'format' : 'iframe', 'height' : 250, 'width' : 300, 'params' : {} };
</script>
<script type="text/javascript" src="//www.highperformanceformat.com/${KEY}/invoke.js"></script>
</body></html>`

  return (
    <iframe
      title="Sponsored"
      srcDoc={srcDoc}
      width={300}
      height={250}
      scrolling="no"
      style={{ border: 0, width: 300, height: 250, background: 'transparent' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  )
}
