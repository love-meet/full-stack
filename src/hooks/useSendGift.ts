import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { type CatalogueGift } from '../lib/gifts'

/**
 * Send a gift on a post.
 *
 * Gifts are free and purely cosmetic. There is no price, no escrow, no
 * accept/decline step — the gift is simply delivered and the recipient is
 * notified.
 *
 * They deliberately grant the recipient NOTHING. Crediting them would let two
 * accounts gift each other free messaging for ever; the credit ledger no
 * longer even has a kind that could express it.
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
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gifts'] })
    },
  })
}
