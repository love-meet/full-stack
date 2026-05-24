import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from './useProfile'

export type SearchableProfile = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  gender: Profile['gender']
  country_code: string | null
  country_name: string | null
  city: string | null
  looking_for: Profile['looking_for']
  interests: string[]
  dob: string | null
  age: number | null
  is_verified: boolean
  created_at: string
}

export type SearchFilters = {
  /** Free-text — matched against handle / display_name / bio. */
  q?: string
  gender?: NonNullable<Profile['gender']>
  lookingFor?: NonNullable<Profile['looking_for']>
  country?: string
  minAge?: number
  maxAge?: number
}

const PAGE_SIZE = 20

/**
 * Strip PostgREST-`or()` special chars from user-typed text so we never
 * have to think about escaping. We keep letters, digits, basic
 * whitespace, dashes, dots, and underscores.
 */
function sanitize(s: string): string {
  return s.replace(/[%,()*"\\]/g, '').trim()
}

export const searchKey = (filters: SearchFilters) => ['search', filters] as const

export function useSearchProfiles(filters: SearchFilters) {
  return useInfiniteQuery<
    SearchableProfile[],
    Error,
    InfiniteData<SearchableProfile[]>,
    ReturnType<typeof searchKey>,
    string | null
  >({
    queryKey: searchKey(filters),
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('searchable_profiles')
        .select(
          'id, handle, display_name, avatar_url, bio, gender, country_code, country_name, city, looking_for, interests, dob, age, is_verified, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      const term = sanitize(filters.q ?? '')
      if (term) {
        const like = `%${term}%`
        query = query.or(
          `handle.ilike.${like},display_name.ilike.${like},bio.ilike.${like}`,
        )
      }
      if (filters.gender) query = query.eq('gender', filters.gender)
      if (filters.lookingFor) query = query.eq('looking_for', filters.lookingFor)
      if (filters.country) {
        const c = sanitize(filters.country)
        if (c) query = query.ilike('country_name', `%${c}%`)
      }
      if (filters.minAge != null) query = query.gte('age', filters.minAge)
      if (filters.maxAge != null) query = query.lte('age', filters.maxAge)

      if (pageParam) query = query.lt('created_at', pageParam)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as SearchableProfile[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE_SIZE ? undefined : last[last.length - 1].created_at,
  })
}
