// Bottom-tab nav mirroring the old mobile MainTabNavigator.
// Order matters — `kind: 'post'` slot renders as the centered gradient circle.
// `kind: 'profile'` slot renders the user's avatar instead of a glyph.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'post' | 'profile'
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/feed',    label: 'Home',    glyph: '⌂', kind: 'tab' },
  { to: '/explore', label: 'Explore', glyph: '⌘', kind: 'tab' },
  { to: '/post',    label: 'Create',  glyph: '+', kind: 'post' },
  { to: '/games',   label: 'Games',   glyph: '🎮', kind: 'tab' },
  { to: '/profile', label: 'Profile', glyph: '☻', kind: 'profile' },
] as const
