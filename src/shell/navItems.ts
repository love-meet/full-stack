// Bottom-tab nav. §1: five tabs — Feeds · Search · Chat · Notification ·
// Profile. There is no Games tab (games live inside a chat) and no post
// composer, so the centered gradient `kind: 'post'` slot is gone too.
// `kind: 'profile'` still renders the user's avatar instead of a glyph.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'profile'
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/feed',          label: 'Feeds',   glyph: '⌂', kind: 'tab' },
  { to: '/search',        label: 'Search',  glyph: '⌕', kind: 'tab' },
  { to: '/chat',          label: 'Chat',    glyph: '✉', kind: 'tab' },
  { to: '/notifications', label: 'Alerts',  glyph: '◔', kind: 'tab' },
  { to: '/profile',       label: 'Profile', glyph: '☻', kind: 'profile' },
] as const
