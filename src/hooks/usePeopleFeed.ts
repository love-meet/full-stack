import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { Profile } from './useProfile'

export type FeedPerson = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  gender: Profile['gender']
  city: string | null
  region: string | null
  country_name: string | null
  language: string | null
  dob: string | null
  gallery_urls: string[]
  /** Distance from the viewer's cursor — 0 is the next card up. */
  slot: number
  /** Total eligible profiles for this viewer. */
  total: number
}

const PAGE_SIZE = 20

export const peopleFeedKey = (userId: string | null) => ['people-feed', userId] as const

/**
 * The people feed (§5).
 *
 * Deliberately NOT an infinite query. The whole point is a stable order with
 * a server-side cursor: the RPC always returns the next `page_size` from
 * wherever the viewer left off, wrapping at the end of the set. Paging with
 * offsets on top of that would fight the cursor.
 *
 * `staleTime: Infinity` matters too — a background refetch mid-scroll would
 * pull a fresh page from an already-advanced cursor and swap the list out
 * from under the viewer. `refetchOnMount: 'always'` is the other half: stable
 * for as long as you're on the screen, fresh from the new cursor every time
 * you come back to it.
 */
export function usePeopleFeed() {
  const session = useAuth((s) => s.session)
  return useQuery<FeedPerson[]>({
    queryKey: peopleFeedKey(session?.user.id ?? null),
    enabled: !!session,
    staleTime: Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('people_feed', { page_size: PAGE_SIZE })
      if (error) throw error
      return (data ?? []) as FeedPerson[]
    },
  })
}

/**
 * Move the cursor on by however many cards the viewer actually consumed.
 *
 * Called with a running total rather than one card at a time so a fast scroll
 * is one round-trip. The server wraps modulo the eligible count, so the
 * client never has to know where the end of the set is.
 *
 * Deliberately does not invalidate the feed query on success: refetching
 * mid-scroll would replace the cards under the viewer's finger. The query's
 * `refetchOnMount: 'always'` picks up the new cursor next time instead.
 */
export function useAdvanceFeed() {
  return useMutation({
    mutationFn: async (n: number): Promise<number> => {
      if (n <= 0) return 0
      const { data, error } = await supabase.rpc('advance_feed_position', { n })
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

/** Years old, or null when no date of birth is set. */
export function ageFrom(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const md = today.getMonth() - d.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < d.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}
