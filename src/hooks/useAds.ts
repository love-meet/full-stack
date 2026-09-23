import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Ads (§7).
 *
 * Always on, for every user, regardless of credit balance. They are not a
 * reward and they unlock nothing — nothing in the app checks a subscription,
 * a balance, or anything else before showing one. The only thing that turns
 * them off is Victor flipping the switch.
 *
 * Two levels, and both must allow it:
 *   * the build   — VITE_AD_PROVIDER unset/'none' compiles ads out of a
 *                   surface entirely (today's reality: AdSense approval is
 *                   pending, so the app ships with ads off)
 *   * the switch  — app_settings.ads_enabled, flipped from the admin console
 *                   and picked up live, no redeploy
 *
 * These two levels are read separately, on purpose:
 *   * useAdsSwitch()  — the raw database value. This is what the admin
 *     toggle displays: Victor needs to see and set the real switch even
 *     today, while the build has no provider configured, so it is already
 *     correct the moment AdSense approval lands and the env is redeployed.
 *   * useAdsVisible() — build AND switch. This is what every render site
 *     (feed card, inline row, sidebar unit) asks, because a render site
 *     cares whether an ad can actually appear right now.
 * Conflating the two would make the admin toggle read as permanently OFF
 * whenever the provider is unconfigured (build state bleeding into a
 * database-truth control) — that is exactly the bug this split avoids.
 */

export type AdProvider = 'adsense' | 'admob' | 'none'

/**
 * Which ad network this build talks to.
 *
 * AdSense on web and inside Telegram, AdMob on the native app. Adsterra was
 * ruled out deliberately: it puts scam creatives next to the product, and we
 * are taking a dating app to Apple's review. That is not the reputation to
 * buy for a bit of fill rate.
 *
 * AdMob is mobile-SDK only — it has no web SDK, so setting this to 'admob' is
 * only meaningful inside the native shell; on web it behaves like 'none'.
 *
 * Defaults to 'none' when unset. An unset variable on any deploy must not
 * start loading a third-party script by accident — ads are opt-in via an
 * explicit env value, and 'none' is what .env.example ships today while
 * AdSense approval is pending.
 */
export const AD_PROVIDER: AdProvider =
  (import.meta.env.VITE_AD_PROVIDER as AdProvider | undefined) ?? 'none'

/** Empty string when unset — same convention as the other VITE_ADSENSE_* vars. */
export const ADSENSE_CLIENT: string = import.meta.env.VITE_ADSENSE_CLIENT ?? ''

/**
 * Whether this build can show AdSense ads at all: the provider is 'adsense'
 * AND a client id is present. One place to ask "can the build show ads" —
 * slot components and the admin note both read this instead of each
 * re-deriving it from the two env vars separately.
 */
export const adsConfigured = AD_PROVIDER === 'adsense' && ADSENSE_CLIENT !== ''

export const adSettingsKey = ['app-settings', 'ads'] as const

const LAST_KNOWN_KEY = 'lm:ads_enabled'

function readLastKnown(): boolean | undefined {
  try {
    const v = localStorage.getItem(LAST_KNOWN_KEY)
    if (v === '1') return true
    if (v === '0') return false
    return undefined
  } catch {
    return undefined
  }
}

function writeLastKnown(enabled: boolean) {
  try {
    localStorage.setItem(LAST_KNOWN_KEY, enabled ? '1' : '0')
  } catch {
    // Storage can be unavailable (private mode, quota); losing the memory is
    // harmless — it only narrows the fail-open window below.
  }
}

/**
 * The database truth for the ads switch: app_settings.ads_enabled. This is
 * what the admin toggle reads and displays — it must reflect the real value
 * even when the build has no ad provider configured, so Victor can set it
 * correctly ahead of AdSense approval landing.
 *
 * Fail open, with memory. A client that cannot read app_settings (network
 * blip, expired token mid-refresh, a Supabase incident) is not Victor
 * choosing to turn ads off — the spec says the switch is "not something a
 * user can switch off" (only Victor's admin action turns it off), so a
 * failing read must not silently cost revenue by defaulting to off. Pure
 * fail-open has one bad case though: if Victor turned ads off for a reason
 * (a policy complaint, a bad creative) and an outage hits, every client
 * would revert to ON against his decision. `lastKnown` bounds that: any
 * client that has ever seen a definite value keeps that value until a fresh
 * definite value arrives; a brand-new client with no memory and no
 * successful read yet falls open to `true`, matching the column's own
 * default.
 *
 * Bound on the fallback: `lastKnown` is a plain localStorage read, so a user
 * who both (a) writes `localStorage['lm:ads_enabled'] = '0'` by hand AND
 * (b) blocks `/rest/v1/app_settings` at cold start can suppress their own
 * ads before any query ever resolves. Blocking the request alone, without
 * tampering with storage, is not enough — that path falls open to `true` per
 * the paragraph above, exactly as intended. And the combined path is not a
 * new hole: an ad-blocker extension already blocks `adsbygoogle.js` itself,
 * which suppresses ads strictly more completely and with far less effort
 * than editing localStorage and shaping network requests. This fallback
 * hands a determined user nothing they could not already get. Do not
 * "harden" this by failing closed on a blocked read — that would make an
 * ordinary network hiccup cost Victor ad revenue on every affected client,
 * which is precisely the failure mode `lastKnown` exists to bound, and would
 * violate the spec rule that ads are not something a user can switch off.
 */
export function useAdsSwitch(): boolean {
  // Read localStorage lazily, once per mount, rather than on every render
  // while `q.data` is still undefined — the value only matters until the
  // first query resolution lands (which also updates `lastKnown` in step
  // via writeLastKnown), so re-reading it on each render buys nothing.
  const [fallback] = useState(() => readLastKnown() ?? true)
  const q = useQuery<boolean>({
    queryKey: adSettingsKey,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('ads_enabled')
        .eq('id', 1)
        .maybeSingle()
      if (error) {
        console.warn('[ads] settings read failed', error)
        throw error
      }
      const enabled = (data as { ads_enabled: boolean } | null)?.ads_enabled ?? true
      writeLastKnown(enabled)
      return enabled
    },
  })
  return q.data ?? fallback
}

/**
 * What every render site asks: can an ad actually appear right now? Both
 * levels must allow it — the build must be configured for a provider AND
 * the database switch must be on.
 */
export function useAdsVisible(): boolean {
  const switchOn = useAdsSwitch()
  return adsConfigured && switchOn
}

/**
 * Flipping the switch empties every ad slot without anyone reloading. Mount
 * ONCE for the whole app (in Shell) — the same realtime topic returns the
 * same channel object to every caller, so a second mount elsewhere would
 * remove this one's subscription when it unmounts.
 */
export function useAdSettingsRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('app-settings')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings' },
        (payload) => {
          const row = payload.new as { ads_enabled?: boolean }
          if (typeof row.ads_enabled === 'boolean') {
            qc.setQueryData(adSettingsKey, row.ads_enabled)
            writeLastKnown(row.ads_enabled)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])
}

/** Admin-only. The RPC re-checks the role server-side. */
export function useSetAdsEnabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<boolean> => {
      const { data, error } = await supabase.rpc('set_ads_enabled', { p_enabled: enabled })
      if (error) throw error
      return !!data
    },
    onSuccess: (enabled) => {
      qc.setQueryData(adSettingsKey, enabled)
      writeLastKnown(enabled)
    },
  })
}
