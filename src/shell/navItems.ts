// Bottom-tab nav mirroring the old mobile MainTabNavigator.
// Order matters — `kind: 'profile'` slot renders the user's avatar instead of a glyph.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'profile'
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/feed',    label: 'Home',    glyph: '⌂', kind: 'tab' },
  { to: '/explore', label: 'Explore', glyph: '⌘', kind: 'tab' },
  { to: '/games',   label: 'Games',   glyph: '🎮', kind: 'tab' },
  { to: '/search',  label: 'Search',  glyph: '🔍', kind: 'tab' },
  { to: '/profile', label: 'Profile', glyph: '☻', kind: 'profile' },
] as const
