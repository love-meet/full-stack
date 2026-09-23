import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

/**
 * Consent and data export (HS-LM-v1 §07).
 *
 * The version string is the point of the consent record. Agreeing to the
 * terms of 23 September 2026 is not agreeing to whatever they say next year,
 * and "what did this person accept" needs a better answer than "the current
 * file". Bump this when the documents change materially.
 */
export const POLICY_VERSION = 'HS-LM-v1'

export type ConsentKind = 'terms' | 'privacy' | 'guidelines' | 'age_18'

export type ConsentRow = {
  kind: ConsentKind
  version: string
  accepted_at: string
}

export function useMyConsents() {
  const session = useAuth((s) => s.session)
  return useQuery<ConsentRow[]>({
    queryKey: ['consents', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_consents')
        .select('kind, version, accepted_at')
        .order('accepted_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ConsentRow[]
    },
  })
}

/**
 * Record consent. Idempotent per (user, kind, version), so calling it twice
 * from a retried signup does not create a second record or move the date.
 */
export function useRecordConsent() {
  return useMutation({
    mutationFn: async (kinds: ConsentKind[]): Promise<number> => {
      const { data, error } = await supabase.rpc('record_consent', {
        p_kinds: kinds,
        p_version: POLICY_VERSION,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

/**
 * Everything we hold about you, as JSON.
 *
 * Deliberately not emailed or queued: the whole export is one query and the
 * person is already authenticated, so making them wait for a human is
 * ceremony. The NDPA and the GDPR both want it to actually arrive.
 */
export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      return data
    },
  })
}

/**
 * Hand the export to the browser as a file.
 *
 * Kept out of the component because the object-URL has to be revoked or the
 * blob leaks for the life of the tab, and that is the sort of thing that gets
 * lost inside a click handler.
 */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
