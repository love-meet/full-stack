import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedPost } from './useFeed'

const PAGE = 18

export function useUserPosts(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: ['user-posts', userId ?? null],
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('posts_with_counts')
        .select('*')
        .eq('author_id', userId!)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as FeedPost[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : last[last.length - 1].created_at,
  })
}
