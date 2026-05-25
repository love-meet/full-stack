import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type ProfileSocial = {
  followers: number
  following: number
  is_following: boolean
  is_subscriber: boolean
}

export const profileSocialKey = (id: string | null | undefined) =>
  ['profile-social', id ?? null] as const

/** Follower/following counts + am-I-following + is-subscriber for a profile. */
export function useProfileSocial(targetId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return useQuery<ProfileSocial>({
    queryKey: profileSocialKey(targetId),
    enabled: !!session && !!targetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_profile_social', { target: targetId })
        .single()
      if (error) throw error
      return data as ProfileSocial
    },
  })
}

/** Follow / unfollow a user, with optimistic count + button update. */
export function useToggleFollow(targetId: string) {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  const key = profileSocialKey(targetId)

  return useMutation({
    mutationFn: async (nextFollowing: boolean) => {
      const me = session?.user.id
      if (!me) throw new Error('not signed in')
      if (nextFollowing) {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: me, following_id: targetId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', me)
          .eq('following_id', targetId)
        if (error) throw error
      }
    },
    onMutate: async (nextFollowing) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProfileSocial>(key)
      if (prev) {
        qc.setQueryData<ProfileSocial>(key, {
          ...prev,
          is_following: nextFollowing,
          followers: Math.max(0, prev.followers + (nextFollowing ? 1 : -1)),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}
