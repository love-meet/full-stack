import { create } from 'zustand'

/**
 * Feed video sound preference, shared across all slides. Videos autoplay
 * muted (browser autoplay policy), and once the user unmutes we keep sound on
 * for every subsequent video in the session.
 */
type FeedPrefs = {
  muted: boolean
  setMuted: (m: boolean) => void
}

export const useFeedPrefs = create<FeedPrefs>((set) => ({
  muted: true,
  setMuted: (muted) => set({ muted }),
}))
