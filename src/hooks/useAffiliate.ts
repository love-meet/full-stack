import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type AffiliateSummary = {
  referral_count: number
  affiliate_earnings: number
}

/** Referral count + lifetime affiliate earnings for the signed-in user. */
export function useAffiliateSummary() {
  const session = useAuth((s) => s.session)
  return useQuery<AffiliateSummary>({
    queryKey: ['affiliate-summary', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_affiliate_summary')
        .select('referral_count, affiliate_earnings')
        .maybeSingle()
      if (error) throw error
      return (data as AffiliateSummary | null) ?? { referral_count: 0, affiliate_earnings: 0 }
    },
  })
}
