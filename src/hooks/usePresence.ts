import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Online   = heartbeat ≤ 60s old (active in the app right now)
 *  Away     = heartbeat ≤ 5 min old (had the app open recently)
 *  Offline  = older than that, or no heartbeat on record */
export type PresenceStatus = 'online' | 'away' | 'offline'

const ONLINE_MS = 60_000          // 60 seconds
const AWAY_MS   = 5 * 60_000      // 5 minutes

export function getPresenceStatus(
  lastSeenAt: string | Date | null | undefined,
): PresenceStatus {
  if (!lastSeenAt) return 'offline'
  const t = typeof lastSeenAt === 'string' ? Date.parse(lastSeenAt) : lastSeenAt.getTime()
  if (!Number.isFinite(t) || t <= 0) return 'offline'
  const age = Date.now() - t
  if (age <= ONLINE_MS) return 'online'
  if (age <= AWAY_MS) return 'away'
  return 'offline'
}

/**
 * Latest heartbeat for a single user. Cached per user id (so the same person
 * appearing in five places on the feed only triggers one fetch), refetched
 * every 30s — same cadence as the touch_last_seen heartbeat itself — and on
 * window focus so a user who came back to the app sees fresh presence
 * immediately. The query returns the raw timestamp string; callers pipe it
 * through `getPresenceStatus()`.
 */
export function usePresence(userId: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: ['presence', userId ?? null],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('last_seen_at')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return (data?.last_seen_at as string | null | undefined) ?? null
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}
