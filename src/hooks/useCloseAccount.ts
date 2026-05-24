import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Invokes the `delete-account` Edge Function. The function verifies the
 * caller's JWT, stamps profiles.deleted_at, then admin-deletes the auth
 * user, which cascades through every table via FK ON DELETE CASCADE.
 *
 * Returns nothing useful — on success the session is invalid and the
 * caller should sign out + navigate back to landing.
 */
export function useCloseAccount() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      })
      if (error) throw error
      const payload = data as { ok?: boolean; error?: string } | null
      if (payload?.error) throw new Error(payload.error)
      if (!payload?.ok) throw new Error('Account delete failed')
    },
  })
}
