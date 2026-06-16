import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type Profile = {
  id: string
  telegram_user_id: number | null
  google_sub: string | null
  handle: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  gender: 'female' | 'male' | 'nonbinary' | 'other' | 'prefer_not_to_say' | null
  dob: string | null
  bio: string | null
  looking_for: 'serious' | 'casual' | 'friends' | null
  interests: string[]
  age_min: number | null
  age_max: number | null
  show_online_status: boolean
  show_distance: boolean
  email_notifications: boolean
  telegram_notifications: boolean
  age_18_confirmed: boolean
  country_code: string | null
  country_name: string | null
  region: string | null
  city: string | null
  lat: number | null
  lon: number | null
  role: 'user' | 'admin' | 'super_admin'
  onboarded_at: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export function useProfile() {
  const session = useAuth((s) => s.session)
  return useQuery<Profile | null>({
    queryKey: ['profile', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      if (!session) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'handle'
    | 'display_name'
    | 'first_name'
    | 'last_name'
    | 'avatar_url'
    | 'gender'
    | 'dob'
    | 'bio'
    | 'looking_for'
    | 'interests'
    | 'age_min'
    | 'age_max'
    | 'show_online_status'
    | 'show_distance'
    | 'email_notifications'
    | 'telegram_notifications'
    | 'age_18_confirmed'
    | 'country_code'
    | 'country_name'
    | 'region'
    | 'city'
    | 'lat'
    | 'lon'
  >
> & { onboarded_at?: string | null }

export function useUpdateProfile() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  const key = ['profile', session?.user.id ?? null] as const
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', session.user.id)
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Profile>(key)
      if (previous) qc.setQueryData(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (profile) => {
      qc.setQueryData(key, profile)
    },
  })
}

/** Fetch any profile by id. Returns null if not found (RLS-stripped or deleted). */
export function useProfileById(userId: string | null | undefined) {
  return useQuery<Profile | null>({
    queryKey: ['profile', userId ?? null],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as Profile | null) ?? null
    },
  })
}

/** Debounced-by-caller username availability check via RPC. */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { candidate: username })
  if (error) throw error
  return !!data
}
