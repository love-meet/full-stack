import { useEffect } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { groupFeedKey, type GroupPost } from './useGroupPosts'

type Pages = InfiniteData<GroupPost[]>

/**
 * Live-updates the visible group feed when other users like/comment.
 * Mount once on ExploreScreen, scoped to the active group slug.
 */
export function useGroupPostsRealtime(slug: string | null | undefined) {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.session?.user.id ?? null)

  useEffect(() => {
    if (!slug) return
    const key = groupFeedKey(slug)

    const patch = (postId: string, fn: (p: GroupPost) => GroupPost) => {
      qc.setQueryData<Pages>(key, (old) => {
        if (!old) return old
        let touched = false
        const next = {
          ...old,
          pages: old.pages.map((page) =>
            page.map((p) => {
              if (p.id !== postId) return p
              touched = true
              return fn(p)
            }),
          ),
        }
        return touched ? next : old
      })
    }

    const channel = supabase
      .channel(`group-feed-${slug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_post_likes' },
        (payload) => {
          const row = payload.new as { post_id: string; user_id: string }
          // Skip our own INSERT — useToggleGroupLike already incremented optimistically.
          if (row.user_id === myId) return
          patch(row.post_id, (p) => ({ ...p, like_count: p.like_count + 1 }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_post_likes' },
        (payload) => {
          const row = payload.old as { post_id: string; user_id: string }
          if (row.user_id === myId) return
          patch(row.post_id, (p) => ({
            ...p,
            like_count: Math.max(0, p.like_count - 1),
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_post_comments' },
        (payload) => {
          const row = payload.new as { post_id: string; author_id?: string }
          if (row.author_id === myId) return
          patch(row.post_id, (p) => ({ ...p, comment_count: p.comment_count + 1 }))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, slug, myId])
}
