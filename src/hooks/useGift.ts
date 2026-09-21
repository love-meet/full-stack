import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type GiftStatus = 'sent' | 'rejected'

export type GiftDetail = {
  id: string
  post_id: string
  sender_id: string
  recipient_id: string
  gift_id: string
  gift_name: string
  gift_image: string | null
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

/** Gifts a user has received (any status), newest first, with sender info. */
export function useReceivedGifts(userId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return useQuery<GiftDetail[]>({
    queryKey: ['gifts:received', userId ?? null],
    enabled: !!session && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_gifts')
        .select(
          '*, sender:sender_id(handle, display_name, avatar_url), recipient:recipient_id(handle, display_name, avatar_url)',
        )
        .eq('recipient_id', userId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as GiftDetail[]
    },
  })
}
