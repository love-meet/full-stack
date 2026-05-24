import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { type CatalogueGift, usdToCents } from '../lib/gifts'
import { feedQueryKey } from './useFeed'

/**
 * Send a gift on a post. Mirrors the old POST /send-gift endpoint:
 * creates a post_gifts row in 'pending' status.
 *
 * The actual sender-debit / recipient-credit happens when M7 lands the
 * wallet RPCs; for now this just records the intent.
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
        .from('post_gifts')
        .insert({
          post_id: vars.postId,
          sender_id: session.user.id,
          recipient_id: vars.recipientId,
          gift_id: vars.gift.giftId,
          gift_name: vars.gift.name,
          gift_image: vars.gift.image,
          amount_cents: usdToCents(vars.gift.price),
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Bump the gift count on the relevant feed card next refresh.
      qc.invalidateQueries({ queryKey: feedQueryKey, refetchType: 'none' })
    },
  })
}
