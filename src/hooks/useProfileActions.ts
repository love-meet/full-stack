import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { FeedPerson } from './usePeopleFeed'

/**
 * Comment / Save / Gift, aimed at a person.
 *
 * The post-shaped versions of these (post_comments, post_bookmarks,
 * post_gifts) are all keyed to a post, and §1 removed the post feed — so the
 * feed card had nothing for them to attach to. 0106 gives profiles their own
 * targets. Gifts stay free and cosmetic; none of this touches credits.
 *
 * "Like" is deliberately NOT a fourth table: it is the gallery interest that
 * already drives matching (see useGalleryFeed). One like signal, not two.
 */

export type ProfileActionState = {
  profile_id: string
  comment_count: number
  gift_count: number
  like_count: number
  saved_by_me: boolean
  liked_by_me: boolean
  gifted_by_me: boolean
}

export type ProfileComment = {
  id: string
  author_id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  body: string
  created_at: string
  like_count: number
  liked_by_me: boolean
  reply_count: number
  can_delete: boolean
}

export type SavedProfile = Omit<FeedPerson, 'slot' | 'total'> & { saved_at: string }

export const actionStateKey = (ids: string[]) => ['profile-action-state', ids.join(',')] as const
export const profileCommentsKey = (id: string) => ['profile-comments', id] as const
export const savedProfilesKey = (userId: string | null) => ['saved-profiles', userId] as const

/**
 * Counts and my-state for a whole page of cards in one request.
 *
 * Asking per card would be twenty round-trips per feed page, and they would
 * all land while the user is already scrolling.
 */
export function useProfileActionState(ids: string[]) {
  const session = useAuth((s) => s.session)
  return useQuery<Record<string, ProfileActionState>>({
    queryKey: actionStateKey(ids),
    enabled: !!session && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('profile_action_state', { p_ids: ids })
      if (error) throw error
      const out: Record<string, ProfileActionState> = {}
      for (const r of (data ?? []) as ProfileActionState[]) out[r.profile_id] = r
      return out
    },
  })
}

/** Save / unsave. Returns the new saved state. */
export function useToggleProfileBookmark() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (profileId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('toggle_profile_bookmark', { p_profile_id: profileId })
      if (error) throw error
      return !!data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-action-state'] })
      qc.invalidateQueries({ queryKey: savedProfilesKey(session?.user.id ?? null) })
    },
  })
}

/** The people you saved, newest first. Private — they are never told. */
export function useSavedProfiles() {
  const session = useAuth((s) => s.session)
  return useQuery<SavedProfile[]>({
    queryKey: savedProfilesKey(session?.user.id ?? null),
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_saved_profiles')
      if (error) throw error
      return (data ?? []) as SavedProfile[]
    },
  })
}

/** Top-level comments on a profile, newest first. */
export function useProfileComments(profileId: string, enabled = true) {
  const session = useAuth((s) => s.session)
  return useQuery<ProfileComment[]>({
    queryKey: profileCommentsKey(profileId),
    enabled: !!session && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_comments', { p_profile_id: profileId })
      if (error) throw error
      return (data ?? []) as ProfileComment[]
    },
  })
}

export function useAddProfileComment(profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc('add_profile_comment', {
        p_profile_id: profileId,
        p_body: body,
        p_parent_id: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileCommentsKey(profileId) })
      qc.invalidateQueries({ queryKey: ['profile-action-state'] })
    },
  })
}

export function useDeleteProfileComment(profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.rpc('delete_profile_comment', { p_comment_id: commentId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileCommentsKey(profileId) })
      qc.invalidateQueries({ queryKey: ['profile-action-state'] })
    },
  })
}

export function useToggleCommentLike(profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('toggle_profile_comment_like', { p_comment_id: commentId })
      if (error) throw error
      return !!data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileCommentsKey(profileId) }),
  })
}

/** Send a cosmetic gift to a person. No price, no credits either way. */
export function useSendProfileGift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { profileId: string; giftId: string; giftName: string; giftImage?: string | null }) => {
      const { error } = await supabase.rpc('send_profile_gift', {
        p_profile_id: v.profileId,
        p_gift_id: v.giftId,
        p_gift_name: v.giftName,
        p_gift_image: v.giftImage ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-action-state'] }),
  })
}
