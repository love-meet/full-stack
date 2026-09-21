import { useEffect, useRef } from 'react'
import { AD_PROVIDER, useAdsEnabled } from '../hooks/useAds'

/**
 * Ads (§7).
 *
 * Google AdSense on web and inside Telegram; AdMob on the native app when it
 * ships. Adsterra was ruled out deliberately — it places scam creatives next
 * to the product, and that is not the reputation to carry into an App Store
 * review for a dating app.
 *
 * AdMob has no web SDK, so it cannot serve these two surfaces at all. When
 * the native shell ships with VITE_AD_PROVIDER=admob, AdSlot below is the one
 * place its banner view plugs in.
 *
 * If AdSense approval is slow: leave VITE_ADSENSE_CLIENT unset. Every slot
 * renders nothing and the app ships without ads, which blocks nothing.
 */

const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) || ''
const SLOT_FEED    = (import.meta.env.VITE_ADSENSE_SLOT_FEED as string | undefined) || ''
const SLOT_INLINE  = (import.meta.env.VITE_ADSENSE_SLOT_INLINE as string | undefined) || ''
const SLOT_SIDEBAR = (import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR as string | undefined) || ''

/** Load the AdSense library once per page-load, only if it's configured. */
function useAdSenseScript(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ADSENSE_CLIENT) return
    const w = window as unknown as Record<string, boolean>
    if (w.__lm_adsense) return
    const s = document.createElement('script')
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
    s.async = true
    s.crossOrigin = 'anonymous'
    document.head.appendChild(s)
    w.__lm_adsense = true
  }, [enabled])
}

type AdsByGoogle = { push: (o: object) => void }

/**
 * One AdSense unit.
 *
 * Each <ins> must be pushed exactly once; pushing twice throws
 * "adsbygoogle.push() error: All ins elements ... already have ads". The ref
 * guard is what makes this safe inside a feed that re-renders on every scroll.
 */
function AdSenseUnit({ slot, format = 'auto', style }: {
  slot: string
  format?: string
  style?: React.CSSProperties
}) {
  const pushed = useRef(false)
  const adsOn = useAdsEnabled()
  useAdSenseScript(adsOn)

  useEffect(() => {
    if (!adsOn || !ADSENSE_CLIENT || !slot || pushed.current) return
    try {
      const w = window as unknown as { adsbygoogle?: AdsByGoogle }
      w.adsbygoogle = w.adsbygoogle ?? ([] as unknown as AdsByGoogle)
      w.adsbygoogle.push({})
      pushed.current = true
    } catch {
      // A blocked or failed ad must never take a screen down with it.
    }
  }, [adsOn, slot])

  if (!adsOn || !ADSENSE_CLIENT || !slot) return null

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
 * In-feed sponsored banner. Shown to everyone the switch allows — no
 * subscription check, no credit check. §7: ads are not a reward and they
 * unlock nothing.
 */
export default function FeedAd() {
  const adsOn = useAdsEnabled()
  if (!adsOn || AD_PROVIDER !== 'adsense') return null
  return <AdSenseUnit slot={SLOT_FEED} format="rectangle" style={{ display: 'block', minHeight: 250, width: '100%' }} />
}

/** Desktop sidebar unit. Renders nothing until its slot id is configured. */
export function SidebarAd() {
  const adsOn = useAdsEnabled()
  if (!adsOn || AD_PROVIDER !== 'adsense') return null
  return <AdSenseUnit slot={SLOT_SIDEBAR} format="vertical" style={{ display: 'block', width: 160, minHeight: 600 }} />
}

/** A framed "Sponsored" banner for inline placement. Same rule: everyone. */
export function InlineAd() {
  const adsOn = useAdsEnabled()
  if (!adsOn || AD_PROVIDER !== 'adsense') return null
  return (
    <div className="my-3 glass rounded-2xl px-3 py-3 flex flex-col items-center gap-2">
      <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
        Sponsored
      </span>
      <AdSenseUnit slot={SLOT_INLINE} />
    </div>
  )
}
