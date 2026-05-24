import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import LoadingShell from './LoadingShell'

/** Requires a signed-in Supabase session. Pre-onboarding routes use this. */
export default function RequireSession() {
  const ready = useAuth((s) => s.ready)
  const session = useAuth((s) => s.session)

  if (!ready) return <LoadingShell />
  if (!session) return <Navigate to="/" replace />
  return <Outlet />
}
