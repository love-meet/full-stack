import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'
import { currencyForCountry, formatCurrency } from '../lib/currency'

type FxResponse = { base: string; rates: Record<string, number>; fetched_at?: string }

/**
 * USD-based FX rates, fetched from the `fx-rates` Edge Function (which caches
 * + refreshes once a day server-side). Cached hard on the client too — there's
 * no value re-fetching within a session.
 */
export function useFxRates() {
  return useQuery<FxResponse | null>({
    queryKey: ['fx-rates'],
    staleTime: 12 * 60 * 60 * 1000, // 12h
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fx-rates')
      if (error) throw error
      return data as FxResponse
    },
  })
}

export type UserCurrency = {
  /** ISO 4217 code shown to the user (their country's currency, or USD if
   *  rates aren't available yet). */
  code: string
  /** True when the display currency is Naira. */
  isNgn: boolean
  /** True when rates are loaded enough to display the local currency. */
  ready: boolean
  /** True while we're still loading rates for a non-USD user — show a
   *  skeleton instead of flashing the USD fallback. */
  pending: boolean
  /** True when we can size the ALATPay (NGN) charge — needs the NGN rate. */
  canCharge: boolean
  /** Format a USD-denominated amount (the wallet's base) in local currency. */
  format: (usd: number) => string
  /** Convert a USD amount to the user's local currency (number). */
  toLocal: (usd: number) => number
  /** Convert a local-currency amount to USD (the base we record). */
  usdFromLocal: (local: number) => number
  /** Convert USD to the NGN amount ALATPay is actually charged. */
  ngnFromUsd: (usd: number) => number
  /** Format an amount already in the local currency. */
  formatLocal: (local: number) => string
}

/**
 * The signed-in user's display currency + conversion helpers. The wallet is
 * stored in USD (base). This converts USD→local for display, local→USD for
 * recording a deposit, and USD→NGN for the actual ALATPay charge. If rates
 * aren't available we fall back to showing USD directly.
 */
export function useUserCurrency(): UserCurrency {
  const profile = useProfile()
  const fx = useFxRates()

  const wanted = currencyForCountry(profile.data?.country_code) // NGN / GHS / USD …
  const rates = fx.data?.rates
  const ngnPerUsd = rates?.NGN
  const localPerUsd = wanted === 'USD' ? 1 : rates?.[wanted]

  const ready = wanted === 'USD' || !!(localPerUsd && localPerUsd > 0)
  const code = ready ? wanted : 'USD'         // graceful fallback to base
  const lpu = code === 'USD' ? 1 : (localPerUsd as number)
  const canCharge = !!(ngnPerUsd && ngnPerUsd > 0)
  // Still waiting on rates for a user whose currency isn't USD, or whose
  // profile hasn't loaded — don't flash the USD fallback, show a skeleton.
  const pending = (profile.isLoading || fx.isLoading) && wanted !== 'USD' && !ready

  return {
    code,
    isNgn: code === 'NGN',
    ready: ready,
    pending,
    canCharge,
    format: (usd) => formatCurrency(usd * lpu, code),
    toLocal: (usd) => usd * lpu,
    usdFromLocal: (local) => local / lpu,
    ngnFromUsd: (usd) => (ngnPerUsd ? Math.round(usd * ngnPerUsd) : 0),
    formatLocal: (local) => formatCurrency(local, code),
  }
}
