import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { feedQueryKey, type FeedPost } from './useFeed'

type FeedPages = InfiniteData<FeedPost[]>

/** Walk every cached feed page; apply `patch` to the matching post if found. */
function patchFeedPost(
  pages: FeedPages | undefined,
  postId: string,
  patch: (p: FeedPost) => FeedPost,
): FeedPages | undefined {
  if (!pages) return pages
  return {
    ...pages,
    pages: pages.pages.map((page) => page.map((p) => (p.id === postId ? patch(p) : p))),
  }
}

/** Optimistic like toggle: flip `liked_by_me`, adjust `like_count`, then sync DB. */
export function useToggleLike() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { postId: string; nextLiked: boolean }) => {
      if (!session) throw new Error('not signed in')
      if (vars.nextLiked) {
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: vars.postId, user_id: session.user.id })
        if (error && error.code !== '23505') throw error // 23505 = unique violation, already liked
      } else {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', vars.postId)
          .eq('user_id', session.user.id)
        if (error) throw error
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: feedQueryKey })
      await qc.cancelQueries({ queryKey: ['post', vars.postId] })
      const prevFeed = qc.getQueryData<FeedPages>(feedQueryKey)
      const prevPost = qc.getQueryData<FeedPost | null>(['post', vars.postId])

      const patch = (p: FeedPost): FeedPost => ({
        ...p,
        liked_by_me: vars.nextLiked,
        like_count: Math.max(0, p.like_count + (vars.nextLiked ? 1 : -1)),
      })

      // Feed pages — what the feed reads from.
      qc.setQueryData<FeedPages>(feedQueryKey, (old) =>
        patchFeedPost(old, vars.postId, patch),
      )
      // Single-post cache — what PostDetailScreen reads from. Without this
      // patch the heart + count don't flip until a refresh, even though the
      // feed bubble does.
      qc.setQueryData<FeedPost | null>(['post', vars.postId], (old) =>
        old ? patch(old) : old,
      )
      return { prevFeed, prevPost }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prevFeed !== undefined) qc.setQueryData(feedQueryKey, ctx.prevFeed)
      if (ctx?.prevPost !== undefined) qc.setQueryData(['post', vars.postId], ctx.prevPost)
    },
    // No onSettled refetch — Realtime keeps counts honest; refetching here
    // would flicker during the rapid-tap case.
  })
}

/** Insert a comment optimistically. */
export function useAddComment() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { postId: string; body: string }) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase.from('post_comments').insert({
        post_id: vars.postId,
        author_id: session.user.id,
        body: vars.body,
      })
      if (error) throw error
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: feedQueryKey })
      const prev = qc.getQueryData<FeedPages>(feedQueryKey)
      qc.setQueryData<FeedPages>(feedQueryKey, (old) =>
        patchFeedPost(old, vars.postId, (p) => ({
          ...p,
          comment_count: p.comment_count + 1,
        })),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(feedQueryKey, ctx.prev)
    },
  })
}

/** Patch a post's editable fields (caption, comments_disabled, hide_like_count, alt_text). */
export function useUpdatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      postId: string
      patch: Partial<{
        caption: string | null
        comments_disabled: boolean
        hide_like_count: boolean
        alt_text: string | null
      }>
    }) => {
      const { data, error } = await supabase
        .from('posts')
        .update(vars.patch)
        .eq('id', vars.postId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: feedQueryKey })
      const prev = qc.getQueryData<FeedPages>(feedQueryKey)
      qc.setQueryData<FeedPages>(feedQueryKey, (old) =>
        patchFeedPost(old, vars.postId, (p) => ({ ...p, ...vars.patch })),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(feedQueryKey, ctx.prev)
    },
  })
}

/** Hard-delete a post you own. Cascades to its likes / comments / gifts via FK. */
export function useDeletePost() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from('posts').delete().eq('id', postId)
      if (error) throw error
      return postId
    },
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: feedQueryKey })
      const prev = qc.getQueryData<FeedPages>(feedQueryKey)
      qc.setQueryData<FeedPages>(feedQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((p) => p.id !== postId)),
        }
      })
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(feedQueryKey, ctx.prev)
    },
    onSuccess: () => {
      // The first-post nudge listens on has-posted. If the user just deleted
      // their LAST post, the count drops to 0 and the modal should pop again
      // asking them to share one. Invalidate so the next paint re-checks.
      if (session) qc.invalidateQueries({ queryKey: ['has-posted', session.user.id] })
    },
  })
}

/** Create a new post. Caller uploads the media to Cloudinary first and passes the URL. */
export function useCreatePost() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      kind: 'image' | 'short_video'
      media_url: string
      media_aspect?: number | null
      caption?: string | null
      hide_like_count?: boolean
      comments_disabled?: boolean
      alt_text?: string | null
      location_label?: string | null
      location_lat?: number | null
      location_lon?: number | null
    }) => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: session.user.id,
          kind: vars.kind,
          media_url: vars.media_url,
          media_aspect: vars.media_aspect ?? null,
          caption: vars.caption ?? null,
          hide_like_count: vars.hide_like_count ?? false,
          comments_disabled: vars.comments_disabled ?? false,
          alt_text: vars.alt_text ?? null,
          location_label: vars.location_label ?? null,
          location_lat: vars.location_lat ?? null,
          location_lon: vars.location_lon ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // New post arrives at the top — refetch the first page only.
      qc.invalidateQueries({ queryKey: feedQueryKey, refetchType: 'active' })
      // The first-post nudge listens on has-posted; flip it now or it'll keep
      // showing the modal until the next focus-refetch.
      if (session) qc.invalidateQueries({ queryKey: ['has-posted', session.user.id] })
    },
  })
}
