import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Whether the signed-in user has a PIN set. */
export function useHasPin() {
  return useQuery<boolean>({
    queryKey: ['has_pin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_pin')
      if (error) throw error
      return !!data
    },
  })
}

/** Set or replace the current user's PIN (4–6 digits). */
export function useSetPin() {
  return useMutation({
    mutationFn: async (pin: string) => {
      if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4–6 digits.')
      const { error } = await supabase.rpc('set_pin', { new_pin: pin })
      if (error) throw error
    },
  })
}

/** Verify a candidate PIN. Returns true if it matches the stored hash. */
export function useVerifyPin() {
  return useMutation({
    mutationFn: async (pin: string) => {
      const { data, error } = await supabase.rpc('verify_pin', { candidate: pin })
      if (error) throw error
      return !!data
    },
  })
}

/** Update the Supabase auth password, then log a security notification
 *  (which also emails the user if they have email notifications on). */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      // Best-effort security alert; never block the password change on it.
      try { await supabase.rpc('notify_password_changed') } catch { /* ignore */ }
    },
  })
}
