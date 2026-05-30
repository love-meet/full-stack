import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useProfile } from '../hooks/useProfile'
import LoadingShell from './LoadingShell'
import PendingGameBubble from '../components/PendingGameBubble'

/**
 * Requires a session AND a completed profile (onboarded_at != null).
 * Authenticated app routes (Feed/Explore/Chat/Search/Profile) use this.
 */
export default function RequireProfile() {
  const ready = useAuth((s) => s.ready)
  const session = useAuth((s) => s.session)
  const profileQuery = useProfile()

  if (!ready) return <LoadingShell />
  if (!session) return <Navigate to="/" replace />
  if (profileQuery.isLoading) return <LoadingShell />
  if (!profileQuery.data?.onboarded_at) return <Navigate to="/onboarding" replace />

  return (
    <>
      <Outlet />
      {/* Follows the user across every authenticated screen with a pending
       *  game lobby — except /play/:code itself (it's a top-level route
       *  outside this wrapper). */}
      <PendingGameBubble />
    </>
  )
}
