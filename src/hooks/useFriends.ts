import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { FeedPerson } from './usePeopleFeed'
import type { FeedPost } from './useFeed'

/**
 * A friend is somebody one of you said Interested about (HS-LM-v1 §05).
 *
 * "Everyone you said you were interested in, and everyone who said it about
 * you" — a union, not a match. One tap is enough; you do not wait for them to
 * tap back. That is deliberate: a mutual-only list leaves a new account with
 * nothing until two people happen to choose each other, and §07 names that
 * first hour as the thing that decides whether anyone returns.
 *
 * `i_said_it` / `they_said_it` are both true when it was mutual.
 */
export type Friend = Omit<FeedPerson, 'slot' | 'total'> & {
  /** A short line they set themselves. */
  status_line: string | null
  /** Presence, for the "online or not" dot §05 asks for on this list only. */
  last_seen_at: string | null
  i_said_it: boolean
  they_said_it: boolean
  since: string
  conversation_id: string | null
}

export const friendsKey = (userId: string | null) => ['friends', userId] as const
export const friendsPostsKey = ['friends-posts'] as const

const PAGE = 10

/** Someone counts as online if they were seen in the last two minutes. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false
  const t = new Date(lastSeenAt).getTime()
  return Number.isFinite(t) && Date.now() - t < ONLINE_WINDOW_MS
}

export function useFriends() {
  const session = useAuth((s) => s.session)
  return useQuery<Friend[]>({
    queryKey: friendsKey(session?.user.id ?? null),
    enabled: !!session,
    // Presence goes stale quickly, and this list is where it is shown.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_friends')
      if (error) throw error
      return (data ?? []) as Friend[]
    },
  })
}

/**
 * Take someone off your friends list (§07 — "Interested is currently a
 * one-way door. There is no way to undo it.").
 *
 * Clears the decision in both directions, so leaving their list also takes
 * you off it. They are not notified.
 */
export function useRemoveFriend() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await supabase.rpc('remove_friend', { p_other: otherId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: friendsKey(session?.user.id ?? null) })
      qc.invalidateQueries({ queryKey: friendsPostsKey })
    },
  })
}

/** The one-line status a person sets on themselves. */
export function useSetStatusLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (text: string): Promise<string | null> => {
      const { data, error } = await supabase.rpc('set_status_line', { p_text: text })
      if (error) throw error
      return (data as string | null) ?? null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['friends'] })
    },
  })
}

/** What your friends posted. Friends only — no strangers, no ranking. */
export function useFriendsPosts() {
  const session = useAuth((s) => s.session)
  return useInfiniteQuery({
    queryKey: friendsPostsKey,
    enabled: !!session,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('friends_posts', {
        p_limit: PAGE,
        p_offset: pageParam,
      })
      if (error) throw error
      return (data ?? []) as FeedPost[]
    },
    getNextPageParam: (last, _all, lastParam) =>
      last.length < PAGE ? undefined : (lastParam as number) + PAGE,
  })
}
