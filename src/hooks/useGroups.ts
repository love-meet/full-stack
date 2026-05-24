import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type GroupRole = 'owner' | 'admin' | 'member'

export type Group = {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  requires_age_gate: boolean
  sort_order: number
  owner_id: string | null
  welcome_message: string | null
  instructions: string | null
  avatar_url: string | null
  cover_url: string | null
  is_default: boolean
  visibility: 'public' | 'private'
  member_count: number
  post_count: number
  my_role: GroupRole | null
  is_member: boolean
}

export function useGroups() {
  return useQuery<Group[]>({
    queryKey: ['groups'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups_with_meta')
        .select('*')
        .order('is_default', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Group[]
    },
  })
}

export function useGroup(slug: string | null | undefined) {
  return useQuery<Group | null>({
    queryKey: ['group', slug ?? null],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups_with_meta')
        .select('*')
        .eq('slug', slug!)
        .maybeSingle()
      if (error) throw error
      return (data as Group | null) ?? null
    },
  })
}
