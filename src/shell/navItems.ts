// Bottom-tab nav. §1: five tabs — Feeds · Friends · Chat · Notification ·
// Profile. There is no Games tab (games live inside a chat) and no post
// composer, so the centered gradient `kind: 'post'` slot is gone too.
// `kind: 'profile'` still renders the user's avatar instead of a glyph.
//
// The second slot was Search. It is Friends now: that spot should show the
// people you have matched with, not a box for typing strangers' names into.
// Search keeps its route (/search) and its header link — it just isn't a tab.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'profile'
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/feed',          label: 'Feeds',   glyph: '⌂', kind: 'tab' },
  { to: '/friends',       label: 'Friends', glyph: '👥', kind: 'tab' },
  { to: '/chat',          label: 'Chat',    glyph: '✉', kind: 'tab' },
  { to: '/notifications', label: 'Alerts',  glyph: '◔', kind: 'tab' },
  { to: '/profile',       label: 'Profile', glyph: '☻', kind: 'profile' },
] as const
