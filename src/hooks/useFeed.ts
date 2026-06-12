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
  location_label: string | null
  location_lat: number | null
  location_lon: number | null
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
 * Ranked feed via the `ranked_feed` RPC: surfaces more of who you follow,
 * verified (subscriber) accounts, and people matching your age preferences,
 * with recency as the tie-breaker. Offset-paginated.
 */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('ranked_feed', {
        p_limit: FEED_PAGE_SIZE,
        p_offset: pageParam,
      })
      if (error) throw error
      return (data ?? []) as FeedPost[]
    },
    getNextPageParam: (last, _all, lastPageParam) =>
      last.length < FEED_PAGE_SIZE ? undefined : (lastPageParam as number) + FEED_PAGE_SIZE,
  })
}
