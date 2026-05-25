import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { type CatalogueGift, usdToCents } from '../lib/gifts'
import { feedQueryKey } from './useFeed'
import { walletKey } from './useWallet'

/**
 * Send a gift on a post via the send_gift RPC. The RPC checks the sender's
 * balance, debits them (escrow), creates the 'pending' gift, and notifies the
 * recipient — who can then accept (recipient is credited) or decline (sender
 * refunded). All movements land in the wallet ledger.
 */
export function useSendGift() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      postId: string
      recipientId: string
      gift: CatalogueGift
    }) => {
      if (!session) throw new Error('not signed in')
      if (session.user.id === vars.recipientId) {
        throw new Error("You can't send a gift to yourself.")
      }
      const { data, error } = await supabase
        .rpc('send_gift', {
          p_post_id: vars.postId,
          p_gift_id: vars.gift.giftId,
          p_gift_name: vars.gift.name,
          p_gift_image: vars.gift.image,
          p_amount_cents: usdToCents(vars.gift.price),
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Bump the gift count on the relevant feed card next refresh.
      qc.invalidateQueries({ queryKey: feedQueryKey, refetchType: 'none' })
      // Sender was debited — refresh wallet + ledger.
      if (session) qc.invalidateQueries({ queryKey: walletKey(session.user.id) })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}
