import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { groupFeedKey, type GroupPost } from './useGroupPosts'
import { processMentions } from '../lib/mentions'

export type GroupComment = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  author_handle: string | null
  author_display_name: string | null
  author_avatar_url: string | null
}

type RawComment = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  author: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}

export const groupCommentsKey = (postId: string) => ['group-comments', postId] as const

/** All comments + replies for a group post, oldest-first. The UI groups
 *  them into roots and replies-by-parent. */
export function useGroupComments(postId: string | null | undefined) {
  return useQuery<GroupComment[]>({
    queryKey: groupCommentsKey(postId ?? '__none__'),
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_post_comments')
        .select('id, post_id, parent_id, author_id, body, created_at, author:profiles!author_id(handle, display_name, avatar_url)')
        .eq('post_id', postId!)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return ((data ?? []) as unknown as RawComment[]).map((c) => ({
        id: c.id,
        post_id: c.post_id,
        parent_id: c.parent_id,
        author_id: c.author_id,
        body: c.body,
        created_at: c.created_at,
        author_handle: c.author?.handle ?? null,
        author_display_name: c.author?.display_name ?? null,
        author_avatar_url: c.author?.avatar_url ?? null,
      }))
    },
  })
}

type Pages = InfiniteData<GroupPost[]>
function bumpFeedCount(
  qc: ReturnType<typeof useQueryClient>,
  slug: string,
  postId: string,
  delta: number,
) {
  const key = groupFeedKey(slug)
  qc.setQueryData<Pages>(key, (old) => {
    if (!old) return old
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((p) =>
          p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p,
        ),
      ),
    }
  })
}

/** Add a comment or reply to a group post. */
export function useAddGroupComment(slug: string, postId: string) {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { body: string; parentId?: string | null }) => {
      if (!session) throw new Error('not signed in')
      const body = vars.body.trim()
      if (!body) throw new Error('Empty comment')
      const { data, error } = await supabase.from('group_post_comments').insert({
        post_id: postId,
        author_id: session.user.id,
        body,
        parent_id: vars.parentId ?? null,
      }).select('id').single()
      if (error) throw error
      if (data) {
        processMentions(body, data.id, 'group').catch(console.error)
      }
    },
    onSuccess: () => {
      bumpFeedCount(qc, slug, postId, 1)
      qc.invalidateQueries({ queryKey: groupCommentsKey(postId) })
    },
  })
}

/** Delete your own group comment (also drops its replies via FK cascade). */
export function useDeleteGroupComment(slug: string, postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('group_post_comments').delete().eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => {
      bumpFeedCount(qc, slug, postId, -1)
      qc.invalidateQueries({ queryKey: groupCommentsKey(postId) })
    },
  })
}
