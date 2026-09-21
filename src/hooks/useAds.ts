import { useEffect } from 'react'
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
 *   * the build   — VITE_AD_PROVIDER=none compiles ads out of a surface
 *                   entirely (useful for a store review build)
 *   * the switch  — app_settings.ads_enabled, flipped from the admin console
 *                   and picked up live, no redeploy
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
 * only meaningful inside the native shell. 'none' compiles ads out entirely,
 * which is also the answer if AdSense approval is slow: ship without ads,
 * nothing is blocked on them.
 */
export const AD_PROVIDER: AdProvider =
  ((import.meta.env.VITE_AD_PROVIDER as AdProvider | undefined) ?? 'adsense')

export const adSettingsKey = ['app-settings', 'ads'] as const

/**
 * Is the ad switch on?
 *
 * Defaults to `true` while loading and on error. Ads are meant to be on; a
 * slow query or a hiccup should not quietly turn off the revenue.
 */
export function useAdsEnabled(): boolean {
  const q = useQuery<boolean>({
    queryKey: adSettingsKey,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('ads_enabled')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      return (data as { ads_enabled: boolean } | null)?.ads_enabled ?? true
    },
  })
  if (AD_PROVIDER === 'none') return false
  return q.data ?? true
}

/** Flipping the switch empties every ad slot without anyone reloading. */
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
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
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
    onSuccess: (enabled) => qc.setQueryData(adSettingsKey, enabled),
  })
}
