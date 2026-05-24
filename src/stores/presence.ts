import { create } from 'zustand'

/**
 * Set of user IDs that are currently "online" — populated by the global
 * Supabase Realtime presence channel that `usePresenceInit` mounts once at
 * the app root. Everywhere else just reads from this store via selectors.
 */
type PresenceState = {
  online: Set<string>
  setOnline: (s: Set<string>) => void
}

export const usePresence = create<PresenceState>((set) => ({
  online: new Set<string>(),
  setOnline: (s) => set({ online: s }),
}))

/** Selector: is this user currently online? Stable identity, cheap diff. */
export function useIsOnline(userId: string | null | undefined): boolean {
  return usePresence((s) => (userId ? s.online.has(userId) : false))
}
