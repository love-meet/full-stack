import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Reporting (HS-LM-v1 §07).
 *
 * "A profile, a photograph and a message must each be reportable, and the
 * report must reach a human."
 *
 * Before 0113 only posts could be reported, which left the most likely thing
 * anyone needs to report — another person — with no path at all.
 */
export type ReportTarget = 'profile' | 'photo' | 'message' | 'topic' | 'topic_reply'

export type ReportReason =
  | 'spam' | 'inappropriate' | 'harassment' | 'underage' | 'illegal' | 'other'

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassing or abusive' },
  { value: 'inappropriate', label: 'Sexual or explicit' },
  { value: 'spam', label: 'Spam, scam or asking for money' },
  { value: 'underage', label: 'They look under 18' },
  { value: 'illegal', label: 'Something illegal' },
  { value: 'other', label: 'Something else' },
]

export function useSubmitReport() {
  return useMutation({
    mutationFn: async (v: {
      target: ReportTarget
      subjectId: string
      ref?: string | null
      reason: ReportReason
      note?: string
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('submit_report', {
        p_target: v.target,
        p_subject: v.subjectId,
        p_ref: v.ref ?? null,
        p_reason: v.reason,
        p_note: v.note ?? null,
      })
      if (error) throw error
      return String(data)
    },
  })
}
