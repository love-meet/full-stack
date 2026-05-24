import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type PostCommentRow = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  like_count: number
  liked_by_me: boolean
  reply_count: number
  author_handle: string | null
  author_display_name: string | null
  author_avatar_url: string | null
  author_gender: 'female' | 'male' | 'nonbinary' | 'other' | 'prefer_not_to_say' | null
}

export const commentsKey   = (postId: string) => ['comments', postId] as const
export const repliesKey    = (commentId: string) => ['replies', commentId] as const

/** Root comments for a post (parent_id IS NULL), oldest-first to match mobile. */
export function useComments(postId: string | null | undefined) {
  return useQuery<PostCommentRow[]>({
    queryKey: commentsKey(postId ?? '__none__'),
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments_with_meta')
        .select('*')
        .eq('post_id', postId!)
        .is('parent_id', null)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as PostCommentRow[]
    },
  })
}

/** Replies under a single root comment. Enabled only when the user expands it. */
export function useReplies(commentId: string | null | undefined, enabled = false) {
  return useQuery<PostCommentRow[]>({
    queryKey: repliesKey(commentId ?? '__none__'),
    enabled: !!commentId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments_with_meta')
        .select('*')
        .eq('parent_id', commentId!)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as PostCommentRow[]
    },
  })
}
