import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cloudinaryUpload } from '../lib/cloudinary'
import { useAuth } from '../stores/auth'
import { groupFeedKey, groupPostKey, type GroupPost } from './useGroupPosts'

type Pages = InfiniteData<GroupPost[]>

function patchPost(pages: Pages | undefined, postId: string, fn: (p: GroupPost) => GroupPost): Pages | undefined {
  if (!pages) return pages
  return {
    ...pages,
    pages: pages.pages.map((page) => page.map((p) => (p.id === postId ? fn(p) : p))),
  }
}

export function useToggleGroupLike(slug: string) {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  const key = groupFeedKey(slug)

  return useMutation({
    mutationFn: async (vars: { postId: string; nextLiked: boolean }) => {
      if (!session) throw new Error('not signed in')
      if (vars.nextLiked) {
        const { error } = await supabase
          .from('group_post_likes')
          .insert({ post_id: vars.postId, user_id: session.user.id })
        if (error && error.code !== '23505') throw error // already liked
      } else {
        const { error } = await supabase
          .from('group_post_likes')
          .delete()
          .eq('post_id', vars.postId)
          .eq('user_id', session.user.id)
        if (error) throw error
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Pages>(key)
      const apply = (p: GroupPost): GroupPost => ({
        ...p,
        liked_by_me: vars.nextLiked,
        like_count: Math.max(0, p.like_count + (vars.nextLiked ? 1 : -1)),
      })
      qc.setQueryData<Pages>(key, (old) => patchPost(old, vars.postId, apply))
      // Also patch the single-post cache so the thread/detail screen updates.
      const postKey = groupPostKey(vars.postId)
      const prevPost = qc.getQueryData<GroupPost | null>(postKey)
      qc.setQueryData<GroupPost | null>(postKey, (old) => (old ? apply(old) : old))
      return { prev, prevPost, postKey }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      if (ctx?.postKey) qc.setQueryData(ctx.postKey, ctx.prevPost)
    },
  })
}

/** Approve or reject a pending group post (group admins / platform admins). */
export function useModerateGroupPost(slug: string) {
  const qc = useQueryClient()
  const key = groupFeedKey(slug)
  return useMutation({
    mutationFn: async (vars: { postId: string; action: 'approve' | 'reject'; reason?: string }) => {
      if (vars.action === 'approve') {
        const { error } = await supabase.rpc('approve_group_post', { post_id: vars.postId })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('reject_group_post', {
          post_id: vars.postId,
          reason: vars.reason ?? null,
        })
        if (error) throw error
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Pages>(key)
      qc.setQueryData<Pages>(key, (old) =>
        patchPost(old, vars.postId, (p) => ({
          ...p,
          status: vars.action === 'approve' ? 'approved' : 'rejected',
        })),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })
}

export function useCreateGroupPost(slug: string) {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  const key = groupFeedKey(slug)

  return useMutation({
    mutationFn: async (vars: {
      groupId: string
      body?: string | null
      media?: { url: string; kind: 'image' | 'video'; aspect: number } | null
    }) => {
      if (!session) throw new Error('not signed in')
      const body = vars.body?.trim() || null
      if (!body && !vars.media) throw new Error('Empty post')
      const { data, error } = await supabase
        .from('group_posts')
        .insert({
          group_id:     vars.groupId,
          author_id:    session.user.id,
          body,
          media_url:    vars.media?.url ?? null,
          media_kind:   vars.media?.kind ?? null,
          media_aspect: vars.media?.aspect ?? null,
          status:       'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key, refetchType: 'active' })
    },
  })
}

/** Cloudinary upload for a group post attachment (image or video). */
export function useUploadGroupMedia() {
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string; kind: 'image' | 'video'; aspect: number }> => {
      if (!session) throw new Error('not signed in')
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) throw new Error('Pick an image or a video.')
      const cap = isVideo ? 40 * 1024 * 1024 : 8 * 1024 * 1024
      if (file.size > cap) {
        throw new Error(`File too large — max ${(cap / 1024 / 1024).toFixed(0)} MB.`)
      }
      const r = await cloudinaryUpload(file, {
        folder: `lm-app/groups/${session.user.id}`,
        resourceType: isVideo ? 'video' : 'image',
        tags: ['group'],
      })
      return {
        url: r.url,
        kind: isVideo ? 'video' : 'image',
        aspect: r.height > 0 ? r.width / r.height : 1,
      }
    },
  })
}
