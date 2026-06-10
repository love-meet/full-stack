import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type MatchPreferences = {
  user_id: string
  partner: Record<string, string>
  self: Record<string, string>
  plan_goal: 'free' | 'premium' | 'vip' | null
  completed_at: string | null
}

const key = (userId?: string | null) => ['match-preferences', userId ?? null] as const

/** The viewer's own match-preferences row (or null if they've never opened
 *  the interview). */
export function useMatchPreferences() {
  const userId = useAuth((s) => s.session?.user.id ?? null)
  return useQuery<MatchPreferences | null>({
    queryKey: key(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_preferences')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return (data as MatchPreferences | null) ?? null
    },
  })
}

/** Upsert the answers. Pass `completed: true` to stamp completed_at.
 *  IMPORTANT: completed_at is only written when `completed === true`. A
 *  partial-progress save (or any future call without the flag) must NOT
 *  nullify an already-stamped completed_at, otherwise a returning user
 *  who's already finished the interview gets re-prompted on every visit. */
export function useSaveMatchPreferences() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.session?.user.id ?? null)
  return useMutation({
    mutationFn: async (vars: {
      partner: Record<string, string>
      self: Record<string, string>
      planGoal?: 'free' | 'premium' | 'vip'
      completed?: boolean
    }) => {
      if (!userId) throw new Error('not authenticated')
      const patch: {
        user_id: string
        partner: Record<string, string>
        self: Record<string, string>
        plan_goal: 'free' | 'premium' | 'vip' | null
        completed_at?: string
      } = {
        user_id: userId,
        partner: vars.partner,
        self: vars.self,
        plan_goal: vars.planGoal ?? null,
      }
      if (vars.completed) patch.completed_at = new Date().toISOString()
      const { error } = await supabase.from('match_preferences').upsert(patch)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(userId) }),
  })
}

/** Background backfill — stamps completed_at = now() on the current user's
 *  row without touching their answers. Used by OnboardingPrompts to heal
 *  returning users whose timestamp didn't persist for any reason. */
export function useBackfillMatchPreferencesComplete() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.session?.user.id ?? null)
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('not authenticated')
      const { error } = await supabase
        .from('match_preferences')
        .update({ completed_at: new Date().toISOString() })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(userId) }),
  })
}

/** Cheap check: does this user have at least one post? Used to gate the
 *  "share your first post" modal. */
export function useHasPosted(userId: string | null | undefined) {
  return useQuery<boolean>({
    queryKey: ['has-posted', userId ?? null],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', userId!)
      if (error) throw error
      return (count ?? 0) > 0
    },
    // Refetch when they navigate back to the feed after posting.
    refetchOnWindowFocus: true,
  })
}
