import { useRelations } from '../hooks/useFollow'
import BlueTick from './BlueTick'

/**
 * Blue verified tick for a single author (comments, replies). Self-contained:
 * looks up subscriber status for the id and renders nothing if not a
 * subscriber. React Query dedupes by id, so repeated authors share one query.
 */
export default function AuthorTick({ userId, size = 14 }: { userId: string | null | undefined; size?: number }) {
  const r = useRelations([userId])
  if (!userId || !r.data?.get(userId)?.is_subscriber) return null
  return <BlueTick size={size} />
}
