import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { FeedPerson } from './usePeopleFeed'

/**
 * A friend is a mutual match — both people marked Interested.
 *
 * Shaped as a FeedPerson (minus the feed's cursor fields) so the Friends tab
 * can draw the same cards the main feed does, plus when the match happened and
 * the conversation if one already exists.
 */
export type Friend = Omit<FeedPerson, 'slot' | 'total'> & {
  matched_at: string
  conversation_id: string | null
}

export const friendsKey = (userId: string | null) => ['friends', userId] as const

export function useFriends() {
  const session = useAuth((s) => s.session)
  return useQuery<Friend[]>({
    queryKey: friendsKey(session?.user.id ?? null),
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_friends')
      if (error) throw error
      return (data ?? []) as Friend[]
    },
  })
}
