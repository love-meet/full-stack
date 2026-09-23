import { useEffect, useRef } from 'react'
import { adsConfigured, ADSENSE_CLIENT, useAdsVisible } from '../hooks/useAds'

/**
 * Ads (§7).
 *
 * Google AdSense on web and inside Telegram; AdMob on the native app when it
 * ships. Adsterra was ruled out deliberately — it places scam creatives next
 * to the product, and that is not the reputation to carry into an App Store
 * review for a dating app.
 *
 * AdMob has no web SDK, so it cannot serve these two surfaces at all. When
 * the native shell ships with VITE_AD_PROVIDER=admob, this is the one place
 * its banner view would plug in.
 *
 * Today AdSense approval is pending, so VITE_AD_PROVIDER is 'none' and
 * `adsConfigured` is false: every slot below renders nothing, no script is
 * ever injected, and no blank or placeholder frame is left behind. Nothing
 * in this file reads AD_PROVIDER directly — everything goes through
 * `adsConfigured` (build state) and `useAdsVisible()` (build + switch), so
 * there is exactly one place that decides whether an ad can appear.
 */

const SLOT_FEED = import.meta.env.VITE_ADSENSE_SLOT_FEED ?? ''
const SLOT_INLINE = import.meta.env.VITE_ADSENSE_SLOT_INLINE ?? ''
const SLOT_SIDEBAR = import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR ?? ''

/**
 * Load the AdSense library once per page-load, and only when a unit is
 * actually about to render — never when the provider is 'none'.
 *
 * The loaded flag is set on the script's `load` event, not up front, and
 * `error` clears the in-flight marker and drops the tag. A transient network
 * failure at first render must not be permanent for the page — the next
 * mount (e.g. scrolling a new ad unit into view) has to be able to retry
 * instead of leaving empty ad frames until a full reload. `__lm_adsense_loading`
 * is a separate marker from `__lm_adsense` so two units mounting in the same
 * tick (effects for sibling components run synchronously, one after another,
 * in the same commit) still only ever inject one script tag: the second
 * unit's effect sees the first one's in-flight marker and bails out.
 */
function useAdSenseScript(shouldLoad: boolean) {
  useEffect(() => {
    if (!shouldLoad || !adsConfigured) return
    if (window.__lm_adsense || window.__lm_adsense_loading) return
    window.__lm_adsense_loading = true
    const s = document.createElement('script')
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
    s.async = true
    s.crossOrigin = 'anonymous'
    s.onload = () => {
      window.__lm_adsense_loading = false
      window.__lm_adsense = true
    }
    s.onerror = () => {
      window.__lm_adsense_loading = false
      s.remove()
    }
    document.head.appendChild(s)
  }, [shouldLoad])
}

type AdsByGoogle = { push: (o: object) => void }

/**
 * One AdSense unit.
 *
 * Each <ins> must be pushed exactly once; pushing twice throws
 * "adsbygoogle.push() error: All ins elements ... already have ads". The ref
 * guard is what makes this safe inside a feed that re-renders on every
 * scroll; when a slot is turned off and back on, the component unmounts and
 * a fresh instance (fresh ref) takes its place, so the guard never blocks a
 * legitimate re-show.
 */
function AdSenseUnit({ slot, format = 'auto', style }: {
  slot: string
  format?: string
  style?: React.CSSProperties
}) {
  const pushed = useRef(false)
  const visible = useAdsVisible()
  const shouldRender = visible && adsConfigured && !!slot
  useAdSenseScript(shouldRender)

  useEffect(() => {
    if (!shouldRender || pushed.current) return
    try {
      const w = window as unknown as { adsbygoogle?: AdsByGoogle }
      w.adsbygoogle = w.adsbygoogle ?? ([] as unknown as AdsByGoogle)
      w.adsbygoogle.push({})
      pushed.current = true
    } catch {
      // A blocked or failed ad must never take a screen down with it.
    }
  }, [shouldRender])

  if (!shouldRender) return null

  return (
    <ins
      className="adsbygoogle"
      style={style ?? { display: 'block', width: '100%' }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  )
}

/**
 * In-feed sponsored banner. Shown to everyone the build + switch allow — no
 * subscription check, no credit check. §7: ads are not a reward and they
 * unlock nothing.
 */
export default function FeedAd() {
  const visible = useAdsVisible()
  if (!visible) return null
  return (
    <AdSenseUnit
      slot={SLOT_FEED}
      format="rectangle"
      style={{ display: 'block', minHeight: 250, width: '100%' }}
    />
  )
}

/** Desktop sidebar unit. Renders nothing until its slot id is configured. */
export function SidebarAd() {
  const visible = useAdsVisible()
  if (!visible) return null
  return (
    <AdSenseUnit
      slot={SLOT_SIDEBAR}
      format="vertical"
      style={{ display: 'block', width: 160, minHeight: 600 }}
    />
  )
}

/** A framed "Sponsored" banner for inline placement. Same rule: everyone. */
export function InlineAd() {
  const visible = useAdsVisible()
  if (!visible) return null
  return (
    <div className="my-3 glass rounded-2xl px-3 py-3 flex flex-col items-center gap-2">
      <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
        Sponsored
      </span>
      <AdSenseUnit slot={SLOT_INLINE} />
    </div>
  )
}
