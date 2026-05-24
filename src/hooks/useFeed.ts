import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type FeedPost = {
  id: string
  author_id: string
  kind: 'image' | 'short_video'
  media_url: string
  media_aspect: number | null
  caption: string | null
  created_at: string
  hide_like_count: boolean
  comments_disabled: boolean
  alt_text: string | null
  like_count: number
  comment_count: number
  gift_count: number
  liked_by_me: boolean
  bookmarked_by_me: boolean
  author_handle: string | null
  author_display_name: string | null
  author_avatar_url: string | null
  author_gender: 'female' | 'male' | 'nonbinary' | 'other' | 'prefer_not_to_say' | null
  author_is_verified: boolean
}

export const FEED_PAGE_SIZE = 10
export const feedQueryKey = ['feed'] as const

/**
 * Cursor-paginated feed via `posts_with_counts`. Cursor is the previous page's
 * oldest `created_at`. Simpler than offset and stable as new posts arrive.
 */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('posts_with_counts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE_SIZE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as FeedPost[]
    },
    getNextPageParam: (last) =>
      last.length < FEED_PAGE_SIZE ? undefined : last[last.length - 1].created_at,
  })
}
