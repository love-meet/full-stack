import { getPresenceStatus, usePresence } from '../hooks/usePresence'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-2 h-2 ring-[1.5px]',
  sm: 'w-2.5 h-2.5 ring-2',
  md: 'w-3 h-3 ring-2',
}

/**
 * Tiny presence indicator anchored over the bottom-right of a user's avatar.
 *
 * Green   — user is active in the app right now (heartbeat ≤ 60s).
 * Yellow  — user was here recently but not active right now (≤ 5 min).
 * Nothing — user is offline (no dot rendered, so older content doesn't get a
 *           busy-looking grey speck on every avatar).
 *
 * Two usage shapes:
 *
 *   <PresenceDot userId={post.author_id} />
 *     Fetches the user's heartbeat. Cached per user id so 20 posts by the
 *     same author still only fire one query. Refetches every 30s.
 *
 *   <PresenceDot lastSeenAt={profile.last_seen_at} />
 *     When the caller already has the timestamp in hand (e.g. a profile
 *     screen that already selected last_seen_at), skip the extra fetch.
 *
 * The parent is responsible for adding `position: relative` to the avatar
 * wrapper — the dot is `absolute bottom-0 right-0`.
 */
export default function PresenceDot(
  props:
    | { userId: string | null | undefined; size?: Size; ringColor?: string; lastSeenAt?: never }
    | { lastSeenAt: string | Date | null | undefined; size?: Size; ringColor?: string; userId?: never },
) {
  const size = props.size ?? 'sm'
  // Tailwind ring color via arbitrary value — defaults to the app surface so
  // the dot reads as if it's mounted on the avatar, regardless of the
  // background the avatar sits on.
  const ring = props.ringColor ?? 'ring-surface-2'

  // Hooks must always run in the same order — call the fetch hook regardless,
  // and just ignore its result when the caller passed lastSeenAt directly.
  const presence = usePresence('userId' in props ? props.userId : null)
  const lastSeenAt = 'lastSeenAt' in props ? props.lastSeenAt : presence.data
  const status = getPresenceStatus(lastSeenAt)
  if (status === 'offline') return null

  const color = status === 'online' ? 'bg-success' : 'bg-gold'
  const ariaLabel = status === 'online' ? 'Online' : 'Away'

  return (
    <span
      aria-label={ariaLabel}
      className={`absolute bottom-0 right-0 rounded-full ${color} ${ring} ${SIZE_CLASS[size]}`}
    />
  )
}
