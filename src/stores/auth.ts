import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = {
  /** Latest Supabase session; null when signed out. */
  session: Session | null
  /** False until the first `getSession()` resolves, so guards don't flicker. */
  ready: boolean
  setSession: (s: Session | null) => void
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  ready: false,
  setSession: (session) => set({ session }),
  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null })
  },
}))

/**
 * Call once at app bootstrap. Reads the initial session, then subscribes to
 * auth state changes. Returns the unsubscribe handle.
 */
export function initAuth(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true })
  })
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true })
  })
  return () => sub.subscription.unsubscribe()
}
