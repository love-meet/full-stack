import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { walletKey } from './useWallet'

export type GiftStatus = 'pending' | 'accepted' | 'rejected' | 'failed'

export type GiftDetail = {
  id: string
  post_id: string
  sender_id: string
  recipient_id: string
  gift_id: string
  gift_name: string
  gift_image: string | null
  amount_cents: number
  status: GiftStatus
  created_at: string
  responded_at: string | null
  sender: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
  recipient: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}

export const giftKey = (id: string | null | undefined) => ['gift', id ?? null] as const

/** A single gift with both parties' profile slices. */
export function useGift(giftId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return useQuery<GiftDetail | null>({
    queryKey: giftKey(giftId),
    enabled: !!session && !!giftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_gifts')
        .select(
          '*, sender:sender_id(handle, display_name, avatar_url), recipient:recipient_id(handle, display_name, avatar_url)',
        )
        .eq('id', giftId!)
        .maybeSingle()
      if (error) throw error
      return (data as GiftDetail | null) ?? null
    },
  })
}

/** Recipient accepts (they're credited) or declines (sender refunded). */
export function useRespondGift() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: { giftId: string; accept: boolean }) => {
      const { data, error } = await supabase
        .rpc('respond_gift', { p_gift_id: vars.giftId, p_accept: vars.accept })
        .select()
        .single()
      if (error) throw error
      return data as GiftDetail
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: giftKey(vars.giftId) })
      if (session) qc.invalidateQueries({ queryKey: walletKey(session.user.id) })
      qc.invalidateQueries({ queryKey: ['ledger'] })
      qc.invalidateQueries({ queryKey: ['earnings_summary'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
