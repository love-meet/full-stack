import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { useProfile } from './useProfile'
import { commentsKey, repliesKey, type PostCommentRow } from './useComments'
import { feedQueryKey } from './useFeed'

function nowIso() { return new Date().toISOString() }

function makeOptimisticRow(
  postId: string,
  parentId: string | null,
  body: string,
  myId: string,
  profile: { handle: string | null; display_name: string | null; avatar_url: string | null; gender: PostCommentRow['author_gender'] } | undefined,
): PostCommentRow {
  return {
    id: `pending-${crypto.randomUUID()}`,
    post_id: postId,
    parent_id: parentId,
    author_id: myId,
    body,
    created_at: nowIso(),
    like_count: 0,
    liked_by_me: false,
    reply_count: 0,
    author_handle: profile?.handle ?? null,
    author_display_name: profile?.display_name ?? null,
    author_avatar_url: profile?.avatar_url ?? null,
    author_gender: profile?.gender ?? null,
  }
}

/** Add a root comment to a post. Optimistic. */
export function useAddComment(postId: string) {
  const session = useAuth((s) => s.session)
  const profileQ = useProfile()
  const qc = useQueryClient()
  const key = commentsKey(postId)

  return useMutation({
    mutationFn: async (body: string) => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, author_id: session.user.id, body })
        .select('id, post_id, parent_id, author_id, body, created_at')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (body) => {
      if (!session) return
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<PostCommentRow[]>(key) ?? []
      const optimistic = makeOptimisticRow(postId, null, body, session.user.id, profileQ.data ?? undefined)
      qc.setQueryData<PostCommentRow[]>(key, [...prev, optimistic])
      return { prev, optimisticId: optimistic.id }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: (inserted, _body, ctx) => {
      // Swap the optimistic id for the real one so realtime de-dupes correctly.
      qc.setQueryData<PostCommentRow[]>(key, (old = []) =>
        old.map((r) =>
          r.id === ctx?.optimisticId
            ? { ...r, id: inserted.id, created_at: inserted.created_at }
            : r,
        ),
      )
      // Bump comment_count on the feed card.
      qc.invalidateQueries({ queryKey: feedQueryKey, refetchType: 'none' })
    },
  })
}

/** Reply to an existing comment. Optimistic on the replies list AND bumps the parent's reply_count. */
export function useReplyComment(postId: string, parentId: string) {
  const session = useAuth((s) => s.session)
  const profileQ = useProfile()
  const qc = useQueryClient()
  const rKey = repliesKey(parentId)
  const cKey = commentsKey(postId)

  return useMutation({
    mutationFn: async (body: string) => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, parent_id: parentId, author_id: session.user.id, body })
        .select('id, post_id, parent_id, author_id, body, created_at')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (body) => {
      if (!session) return
      await qc.cancelQueries({ queryKey: rKey })
      const prevReplies = qc.getQueryData<PostCommentRow[]>(rKey) ?? []
      const optimistic = makeOptimisticRow(postId, parentId, body, session.user.id, profileQ.data ?? undefined)
      qc.setQueryData<PostCommentRow[]>(rKey, [...prevReplies, optimistic])
      // Bump parent's reply_count locally too.
      qc.setQueryData<PostCommentRow[]>(cKey, (old = []) =>
        old.map((c) => (c.id === parentId ? { ...c, reply_count: c.reply_count + 1 } : c)),
      )
      return { prevReplies, optimisticId: optimistic.id }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevReplies) qc.setQueryData(rKey, ctx.prevReplies)
      qc.setQueryData<PostCommentRow[]>(cKey, (old = []) =>
        old.map((c) => (c.id === parentId ? { ...c, reply_count: Math.max(0, c.reply_count - 1) } : c)),
      )
    },
    onSuccess: (inserted, _v, ctx) => {
      qc.setQueryData<PostCommentRow[]>(rKey, (old = []) =>
        old.map((r) =>
          r.id === ctx?.optimisticId
            ? { ...r, id: inserted.id, created_at: inserted.created_at }
            : r,
        ),
      )
    },
  })
}

/** Like / unlike a comment, optimistic. Works for both root comments and replies. */
export function useToggleCommentLike(postId: string) {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  const cKey = commentsKey(postId)

  return useMutation({
    mutationFn: async (vars: { commentId: string; parentId: string | null; nextLiked: boolean }) => {
      if (!session) throw new Error('not signed in')
      if (vars.nextLiked) {
        const { error } = await supabase
          .from('post_comment_likes')
          .insert({ comment_id: vars.commentId, user_id: session.user.id })
        if (error && error.code !== '23505') throw error // 23505 = unique violation
      } else {
        const { error } = await supabase
          .from('post_comment_likes')
          .delete()
          .eq('comment_id', vars.commentId)
          .eq('user_id', session.user.id)
        if (error) throw error
      }
    },
    onMutate: async (vars) => {
      const patch = (rows: PostCommentRow[] | undefined) =>
        (rows ?? []).map((r) =>
          r.id === vars.commentId
            ? { ...r, liked_by_me: vars.nextLiked, like_count: Math.max(0, r.like_count + (vars.nextLiked ? 1 : -1)) }
            : r,
        )
      // Roots
      const prevRoots = qc.getQueryData<PostCommentRow[]>(cKey)
      qc.setQueryData<PostCommentRow[]>(cKey, (old) => patch(old))
      // If it's a reply, also patch the parent's replies cache (if loaded).
      let prevReplies: { key: ReturnType<typeof repliesKey>; data: PostCommentRow[] | undefined } | null = null
      if (vars.parentId) {
        const rKey = repliesKey(vars.parentId)
        prevReplies = { key: rKey, data: qc.getQueryData<PostCommentRow[]>(rKey) }
        qc.setQueryData<PostCommentRow[]>(rKey, (old) => patch(old))
      }
      return { prevRoots, prevReplies }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevRoots) qc.setQueryData(cKey, ctx.prevRoots)
      if (ctx?.prevReplies) qc.setQueryData(ctx.prevReplies.key, ctx.prevReplies.data)
    },
  })
}

/**
 * Edit your own comment's body. Optimistic — patches both the roots cache
 * and the replies cache (we may not know which one the comment lives in).
 */
export function useUpdateComment(postId: string) {
  const qc = useQueryClient()
  const cKey = commentsKey(postId)

  return useMutation({
    mutationFn: async (vars: { commentId: string; parentId: string | null; body: string }) => {
      const { data, error } = await supabase
        .from('post_comments')
        .update({ body: vars.body })
        .eq('id', vars.commentId)
        .select('id, post_id, parent_id, author_id, body, created_at')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (vars) => {
      const patch = (rows: PostCommentRow[] | undefined) =>
        (rows ?? []).map((r) => (r.id === vars.commentId ? { ...r, body: vars.body } : r))
      const prevRoots = qc.getQueryData<PostCommentRow[]>(cKey)
      qc.setQueryData<PostCommentRow[]>(cKey, (old) => patch(old))
      let prevReplies: { key: ReturnType<typeof repliesKey>; data: PostCommentRow[] | undefined } | null = null
      if (vars.parentId) {
        const rKey = repliesKey(vars.parentId)
        prevReplies = { key: rKey, data: qc.getQueryData<PostCommentRow[]>(rKey) }
        qc.setQueryData<PostCommentRow[]>(rKey, (old) => patch(old))
      }
      return { prevRoots, prevReplies }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevRoots) qc.setQueryData(cKey, ctx.prevRoots)
      if (ctx?.prevReplies) qc.setQueryData(ctx.prevReplies.key, ctx.prevReplies.data)
    },
  })
}

/** Delete your own comment (or reply). */
export function useDeleteComment(postId: string) {
  const qc = useQueryClient()
  const cKey = commentsKey(postId)

  return useMutation({
    mutationFn: async (vars: { commentId: string; parentId: string | null }) => {
      const { error } = await supabase.from('post_comments').delete().eq('id', vars.commentId)
      if (error) throw error
      return vars
    },
    onSuccess: (vars) => {
      if (vars.parentId) {
        qc.setQueryData<PostCommentRow[]>(repliesKey(vars.parentId), (old = []) =>
          old.filter((r) => r.id !== vars.commentId),
        )
        qc.setQueryData<PostCommentRow[]>(cKey, (old = []) =>
          old.map((c) => (c.id === vars.parentId ? { ...c, reply_count: Math.max(0, c.reply_count - 1) } : c)),
        )
      } else {
        qc.setQueryData<PostCommentRow[]>(cKey, (old = []) =>
          old.filter((c) => c.id !== vars.commentId),
        )
      }
      qc.invalidateQueries({ queryKey: feedQueryKey, refetchType: 'none' })
    },
  })
}
