// Bottom-tab nav: Feeds · Friends · New · Alerts · Profile.
//
// `kind: 'profile'` renders the user's avatar instead of a glyph;
// `kind: 'new'` renders the centered gradient button that opens the composer.
//
// Two slots changed from the original §1 layout, both on Esther's review:
//
//   Search → Friends.  That spot should show the people you follow each
//   other with, not a box for typing strangers' names into. Search keeps its
//   route (/search) and its header icon — it just isn't a tab.
//
//   Chat → New.  There was no way to reach the composer at all, and the
//   bottom bar is the only place people look for one. Chat did not lose its
//   entry point: it is in the top bar on every screen, with a live unread
//   badge, which a tab cannot show any better.
//
//   Alerts → Tips.  HS-LM-v1 §01 makes relationship tips the third thing
//   that keeps people here, alongside games and conversation, so it earns a
//   tab. Notifications went to the top bar for the same reason chat did —
//   the bell there already carries an unread count, and five tabs is the
//   most a thumb can aim at without looking.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'profile' | 'new'
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/feed',          label: 'Feeds',   glyph: '⌂', kind: 'tab' },
  { to: '/friends',       label: 'Friends', glyph: '👥', kind: 'tab' },
  { to: '/post',          label: 'New',     glyph: '+', kind: 'new' },
  { to: '/tips',          label: 'Tips',    glyph: '✦', kind: 'tab' },
  { to: '/profile',       label: 'Profile', glyph: '☻', kind: 'profile' },
] as const
