import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Tracks how many bottom-sheet drawers are currently open. The BottomNav
 * reads this and hides itself while any drawer is open — matches the
 * mobile behaviour where the sheet covers the nav entirely so the input
 * at the bottom of the sheet isn't obscured.
 */
type UiState = {
  drawerCount: number
  bumpDrawer: (delta: number) => void
}

export const useUi = create<UiState>((set) => ({
  drawerCount: 0,
  bumpDrawer: (delta) => set((s) => ({ drawerCount: Math.max(0, s.drawerCount + delta) })),
}))

/**
 * Mount this in every drawer component (or anything that wants to suppress
 * the bottom nav while it's visible). Increments on mount, decrements on
 * unmount.
 */
export function useDrawerLock(): void {
  useEffect(() => {
    useUi.getState().bumpDrawer(1)
    return () => useUi.getState().bumpDrawer(-1)
  }, [])
}
