import { useEffect } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { feedQueryKey, type FeedPost } from './useFeed'

type FeedPages = InfiniteData<FeedPost[]>

/**
 * Live-updates feed cards as other users like/unlike/comment on them.
 * Mount once on the Feed screen.
 *
 * NOTE: subscribes to ALL like/comment events. Fine while volumes are low;
 * if it gets noisy, add a `filter: 'post_id=in.(uuid1,uuid2,...)'` clause
 * keyed off the currently cached post ids.
 */
export function useFeedRealtime() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.session?.user.id ?? null)

  useEffect(() => {
    const patch = (postId: string, fn: (p: FeedPost) => FeedPost) => {
      qc.setQueryData<FeedPages>(feedQueryKey, (old) => {
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
      .channel('feed-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_likes' },
        (payload) => {
          const row = payload.new as { post_id: string; user_id: string }
          // SKIP our own INSERT — already counted optimistically by useToggleLike.
          // Otherwise we'd double-count: +1 from onMutate then +1 from realtime.
          if (row.user_id === myId) return
          patch(row.post_id, (p) => ({
            ...p,
            like_count: p.like_count + 1,
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_likes' },
        (payload) => {
          const row = payload.old as { post_id: string; user_id: string }
          // Same: own DELETE already decremented optimistically.
          if (row.user_id === myId) return
          patch(row.post_id, (p) => ({
            ...p,
            like_count: Math.max(0, p.like_count - 1),
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        (payload) => {
          const row = payload.new as { post_id: string; author_id?: string; parent_id?: string | null }
          // Only count ROOT comments on the card (matches posts_with_counts).
          if (row.parent_id) return
          // Skip our own — useAddComment already invalidated/updated.
          if (row.author_id === myId) return
          patch(row.post_id, (p) => ({ ...p, comment_count: p.comment_count + 1 }))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, myId])
}
