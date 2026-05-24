import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type GroupPostStatus = 'pending' | 'approved' | 'rejected'
export type GroupMediaKind = 'image' | 'video'

export type GroupPost = {
  id: string
  group_id: string
  group_slug: string
  author_id: string
  body: string | null
  status: GroupPostStatus
  media_url: string | null
  media_kind: GroupMediaKind | null
  media_aspect: number | null
  created_at: string
  like_count: number
  comment_count: number
  liked_by_me: boolean
  author_handle: string | null
  author_display_name: string | null
  author_avatar_url: string | null
}

export const GROUP_FEED_PAGE_SIZE = 15
export const groupFeedKey = (slug: string) => ['group-feed', slug] as const
export const groupPostKey = (postId: string) => ['group-post', postId] as const

/** A single group post (for the thread/detail screen). */
export function useGroupPost(postId: string | null | undefined) {
  return useQuery<GroupPost | null>({
    queryKey: groupPostKey(postId ?? '__none__'),
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_posts_with_counts')
        .select('*')
        .eq('id', postId!)
        .maybeSingle()
      if (error) throw error
      return (data as GroupPost | null) ?? null
    },
  })
}

export function useGroupPosts(slug: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: groupFeedKey(slug ?? '__none__'),
    enabled: !!slug,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('group_posts_with_counts')
        .select('*')
        .eq('group_slug', slug!)
        .order('created_at', { ascending: false })
        .limit(GROUP_FEED_PAGE_SIZE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as GroupPost[]
    },
    getNextPageParam: (last) =>
      last.length < GROUP_FEED_PAGE_SIZE ? undefined : last[last.length - 1].created_at,
  })
}
