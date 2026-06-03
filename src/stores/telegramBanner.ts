import { create } from 'zustand'

type Store = {
  visible: boolean
  show: () => void
  hide: () => void
}

/**
 * Whether the "Open in Telegram" banner is showing. Flipped on by
 * main.tsx after the silent redirect attempt fails; flipped off when the
 * user dismisses the banner.
 */
export const useTelegramBanner = create<Store>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}))
