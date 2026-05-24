import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedPost } from './useFeed'

/** Fetch a single post by id from posts_with_counts. */
export function usePost(postId: string | null | undefined) {
  return useQuery<FeedPost | null>({
    queryKey: ['post', postId ?? null],
    enabled: !!postId,
    queryFn: async () => {
      if (!postId) return null
      const { data, error } = await supabase
        .from('posts_with_counts')
        .select('*')
        .eq('id', postId)
        .maybeSingle()
      if (error) throw error
      return (data as FeedPost | null) ?? null
    },
  })
}
