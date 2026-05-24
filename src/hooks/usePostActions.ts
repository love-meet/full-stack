import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { feedQueryKey, type FeedPost } from './useFeed'

type FeedPages = InfiniteData<FeedPost[]>

function patchPost(pages: FeedPages | undefined, postId: string, fn: (p: FeedPost) => FeedPost): FeedPages | undefined {
  if (!pages) return pages
  return {
    ...pages,
    pages: pages.pages.map((page) => page.map((p) => (p.id === postId ? fn(p) : p))),
  }
}

/** Toggle a post bookmark. Optimistic. */
export function useToggleBookmark() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { postId: string; nextBookmarked: boolean }) => {
      if (!session) throw new Error('not signed in')
      if (vars.nextBookmarked) {
        const { error } = await supabase
          .from('post_bookmarks')
          .insert({ post_id: vars.postId, user_id: session.user.id })
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('post_bookmarks')
          .delete()
          .eq('post_id', vars.postId)
          .eq('user_id', session.user.id)
        if (error) throw error
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: feedQueryKey })
      const prev = qc.getQueryData<FeedPages>(feedQueryKey)
      qc.setQueryData<FeedPages>(feedQueryKey, (old) =>
        patchPost(old, vars.postId, (p) => ({ ...p, bookmarked_by_me: vars.nextBookmarked })),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(feedQueryKey, ctx.prev)
    },
  })
}

/** Mute someone — they're not blocked, you just don't see their content in your feed. */
export function useMuteUser() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase
        .from('user_mutes')
        .insert({ muter_id: session.user.id, muted_id: targetUserId })
      if (error && error.code !== '23505') throw error
    },
    onSuccess: (_d, targetUserId) => {
      qc.setQueryData(['user_mutes:is', targetUserId], true)
    },
  })
}

/** Reverse of useMuteUser — they'll show up in your feed again. */
export function useUnmuteUser() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase
        .from('user_mutes')
        .delete()
        .eq('muter_id', session.user.id)
        .eq('muted_id', targetUserId)
      if (error) throw error
    },
    onSuccess: (_d, targetUserId) => {
      qc.setQueryData(['user_mutes:is', targetUserId], false)
    },
  })
}

/** Am I currently muting this user? Cached so the chat menu can toggle. */
export function useIsMuting(targetUserId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return useQuery<boolean>({
    queryKey: ['user_mutes:is', targetUserId ?? null],
    enabled: !!session && !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_mutes')
        .select('muter_id')
        .eq('muter_id', session!.user.id)
        .eq('muted_id', targetUserId!)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
  })
}

/** Block someone — stronger than mute; future queries filter both ways. */
export function useBlockUser() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: session.user.id, blocked_id: targetUserId })
      if (error && error.code !== '23505') throw error
    },
    onSuccess: (_d, targetUserId) => {
      // Optimistically hide their posts from the current feed cache.
      qc.setQueryData<FeedPages>(feedQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((p) => p.author_id !== targetUserId)),
        }
      })
    },
  })
}

/** A user I've blocked or muted, with their public profile fields. */
export type RelatedUser = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  since: string
}

/** Users I've blocked. */
export function useBlockedUsers() {
  const session = useAuth((s) => s.session)
  return useQuery<RelatedUser[]>({
    queryKey: ['blocked_users', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('created_at, blocked:profiles!blocked_id(id, handle, display_name, avatar_url)')
        .eq('blocker_id', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawRelated[]).map(toRelated)
    },
  })
}

/** Users I've muted. */
export function useMutedUsers() {
  const session = useAuth((s) => s.session)
  return useQuery<RelatedUser[]>({
    queryKey: ['muted_users', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_mutes')
        .select('created_at, muted:profiles!muted_id(id, handle, display_name, avatar_url)')
        .eq('muter_id', session!.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawRelatedMute[]).map(toRelatedMute)
    },
  })
}

type RawRelated = {
  created_at: string
  blocked: { id: string; handle: string | null; display_name: string | null; avatar_url: string | null } | null
}
type RawRelatedMute = {
  created_at: string
  muted: { id: string; handle: string | null; display_name: string | null; avatar_url: string | null } | null
}
function toRelated(r: RawRelated): RelatedUser {
  return {
    id: r.blocked?.id ?? '',
    handle: r.blocked?.handle ?? null,
    display_name: r.blocked?.display_name ?? null,
    avatar_url: r.blocked?.avatar_url ?? null,
    since: r.created_at,
  }
}
function toRelatedMute(r: RawRelatedMute): RelatedUser {
  return {
    id: r.muted?.id ?? '',
    handle: r.muted?.handle ?? null,
    display_name: r.muted?.display_name ?? null,
    avatar_url: r.muted?.avatar_url ?? null,
    since: r.created_at,
  }
}

/** Reverse of useBlockUser. */
export function useUnblockUser() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', targetUserId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked_users'] })
      qc.invalidateQueries({ queryKey: feedQueryKey })
    },
  })
}

export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'underage' | 'illegal' | 'other'

/** File a report on a post. Lands in the admin queue (M8). */
export function useReportPost() {
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: { postId: string; reason: ReportReason; note?: string | null }) => {
      if (!session) throw new Error('not signed in')
      const { error } = await supabase.from('post_reports').insert({
        post_id: vars.postId,
        reporter_id: session.user.id,
        reason: vars.reason,
        note: vars.note?.trim() || null,
      })
      if (error) throw error
    },
  })
}
