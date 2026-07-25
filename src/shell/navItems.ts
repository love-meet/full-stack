// Bottom-tab nav mirroring the old mobile MainTabNavigator.
// Order matters — `kind: 'profile'` slot renders the user's avatar instead of a glyph.

export type NavItem = {
  to: string
  label: string
  glyph: string          // Unicode fallback / used in sidebar
  glyphActive?: string   // optional filled variant for the active state
  kind: 'tab' | 'profile'
}

/** Minimal shape of react-i18next's `t` — avoids importing it into this data file. */
type TFunc = (key: string) => string

export function getNavItems(t: TFunc): readonly NavItem[] {
  return [
    { to: '/feed',    label: t('nav.home'),    glyph: '⌂', kind: 'tab' },
    { to: '/explore', label: t('nav.explore'), glyph: '⌘', kind: 'tab' },
    { to: '/games',   label: t('nav.games'),   glyph: '🎮', kind: 'tab' },
    { to: '/search',  label: t('nav.search'),  glyph: '🔍', kind: 'tab' },
    { to: '/profile', label: t('nav.profile'), glyph: '☻', kind: 'profile' },
  ] as const
}
