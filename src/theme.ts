// Single source of truth for design tokens — Cosmic Midnight palette.
// Mirrored into Tailwind via the `@theme` block in src/index.css.

export const colors = {
  // Backgrounds — deep navy scale, never pure black.
  surface: '#070A16',
  surface2: '#0D1430',
  surface3: '#1A2348',

  // Brand / accent family (cool). Names are historical:
  //   rose = pink (primary), magenta = purple, coral = azure, gold = cyan.
  rose: '#FF3D8E',
  magenta: '#9B4DFF',
  coral: '#4D7CFF',
  gold: '#35CDE8',

  // Ink — cool white with a faint blue tint.
  ink: '#F1F5FF',
  ink2: '#C6D1EC',
  inkMuted: '#8A96BD',

  // Semantic.
  success: '#3DDC97',
  danger: '#FF5A7A',
  warning: '#FFC861',

  // Solid black/white for the rare cases.
  black: '#000000',
  white: '#FFFFFF',
} as const

export const gradients = {
  brand: `linear-gradient(135deg, ${colors.rose} 0%, ${colors.magenta} 100%)`,
  warm: `linear-gradient(135deg, ${colors.gold} 0%, ${colors.coral} 50%, ${colors.magenta} 100%)`,
  glow: `radial-gradient(circle at 50% 50%, ${colors.rose}33 0%, transparent 70%)`,
} as const

export type ColorToken = keyof typeof colors
