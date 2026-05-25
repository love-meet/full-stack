import { create } from 'zustand'

/**
 * Which conversation is open in the desktop right-rail panel. Mobile uses the
 * full-screen /chat/:id route instead, so this only drives the xl+ rail.
 */
type ActiveConversation = {
  id: string | null
  open: (id: string) => void
  close: () => void
}

export const useActiveConversation = create<ActiveConversation>((set) => ({
  id: null,
  open: (id) => set({ id }),
  close: () => set({ id: null }),
}))
