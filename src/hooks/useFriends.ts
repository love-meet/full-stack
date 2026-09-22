import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { FeedPerson } from './usePeopleFeed'
import type { FeedPost } from './useFeed'

/**
 * A friend is someone who follows you back.
 *
 * Not a mutual gallery match — that is the dating signal, and the Interested
 * tab already reports it. Friendship is the social one: two rows in
 * public.follows pointing at each other (see 0107).
 */
export type Friend = Omit<FeedPerson, 'slot' | 'total'> & {
  /** When the second of the two follows happened. */
  matched_at: string
  conversation_id: string | null
}

export const friendsKey = (userId: string | null) => ['friends', userId] as const
export const friendsPostsKey = ['friends-posts'] as const

const PAGE = 10

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

/**
 * What your friends posted, newest first.
 *
 * Scoped to mutual follows — this is not the public post feed §1 removed.
 * No strangers, no ranking, no discovery: just the people who follow you back.
 */
export function useFriendsPosts() {
  const session = useAuth((s) => s.session)
  return useInfiniteQuery({
    queryKey: friendsPostsKey,
    enabled: !!session,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('friends_posts', {
        p_limit: PAGE,
        p_offset: pageParam,
      })
      if (error) throw error
      return (data ?? []) as FeedPost[]
    },
    getNextPageParam: (last, _all, lastParam) =>
      last.length < PAGE ? undefined : (lastParam as number) + PAGE,
  })
}
