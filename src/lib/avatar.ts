// Avatar fallbacks live in /public. We pick by gender so the placeholder
// at least roughly matches the user; everyone else falls through to male.jpg
// (per user instruction).

import type { Profile } from '../hooks/useProfile'

export function defaultAvatar(gender: Profile['gender'] | null | undefined): string {
  switch (gender) {
    case 'female': return '/female.jpg'
    case 'male':   return '/male.jpg'
    case 'nonbinary':
    case 'other':
    case 'prefer_not_to_say':
                   return '/default-profile.jpg'
    default:       return '/male.jpg'
  }
}

/** Single source of truth: real avatar if set, otherwise a gender-aware default. */
export function avatarFor(
  p: Pick<Profile, 'avatar_url' | 'gender'> | null | undefined,
): string {
  if (p?.avatar_url) return p.avatar_url
  return defaultAvatar(p?.gender ?? null)
}

/** For places where we only have a URL (chat partner, post author). */
export function avatarUrlOr(
  url: string | null | undefined,
  gender?: Profile['gender'] | null,
): string {
  if (url) return url
  return defaultAvatar(gender ?? null)
}
