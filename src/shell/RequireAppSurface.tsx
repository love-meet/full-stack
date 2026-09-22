import { Navigate, Outlet } from 'react-router-dom'
import { appRunsHere } from '../lib/surface'

/**
 * The app does not exist on the website.
 *
 * lovemeetapp.com is a brochure: it describes the product and sends you to
 * Telegram. Signing in, the feed, chat, games, credits — none of that runs in
 * a desktop browser. Everything behind this guard is Telegram-only (and, once
 * the store listings exist, the phone apps).
 *
 * Why a guard rather than just removing the sign-in buttons: the routes still
 * exist, and a bookmark, a shared /profile/<id> link or a stale tab would
 * otherwise drop someone into a half-working app with no way to sign in.
 * Better to land them on the page that says where the app actually is.
 */
export default function RequireAppSurface() {
  if (!appRunsHere()) return <Navigate to="/" replace />
  return <Outlet />
}
