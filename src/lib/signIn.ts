import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'
import { getSurface } from './surface'

/**
 * Telegram Mini-App sign-in. Reads `initData` from the Telegram WebApp SDK,
 * sends it to our `auth-telegram` Edge Function for HMAC verification, and
 * navigates the page to the returned magic-link action_url which Supabase
 * uses to set the session.
 */
export async function signInWithTelegram(): Promise<void> {
  if (getSurface() !== 'telegram') {
    throw new Error('Not running inside Telegram.')
  }
  const initData = window.Telegram?.WebApp?.initData
  if (!initData) throw new Error('No initData; open this app from the Telegram bot menu.')

  // A plain fetch rather than supabase.functions.invoke().
  //
  // invoke() collapses every failure — DNS, CORS, a 400 with a perfectly
  // good explanation in the body, a 500 — into one string: "Failed to send a
  // request to the Edge Function". That is what a user reported from a phone
  // this could not be reproduced on, and it named nothing: not the status,
  // not the URL, not the reason. Sign-in is the one call where an
  // undebuggable error costs the whole account, so it reports what actually
  // happened instead.
  const endpoint = `${SUPABASE_URL}/functions/v1/auth-telegram`
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ initData }),
    })
  } catch (e) {
    // fetch() itself rejected: offline, DNS, or the request was blocked.
    throw new Error(
      `Could not reach sign-in (${endpoint}): ${(e as Error).message}`,
      { cause: e },
    )
  }

  const text = await res.text()
  let data: { action_url?: string; error?: string } = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* not JSON — use the raw text below */ }

  if (!res.ok) {
    throw new Error(data.error || `Sign-in failed (HTTP ${res.status}): ${text.slice(0, 160)}`)
  }
  if (!data.action_url) throw new Error('Sign-in returned no link. Please try again.')

  // Following the action_url consumes the magic-link token and sets the
  // Supabase session via cookies/local storage. A full navigation is the
  // simplest reliable trigger; the redirectTo lands the user back here.
  window.location.assign(data.action_url)
}

/**
 * Web sign-in via Google OAuth. Returns immediately — the OAuth round-trip
 * navigates the page and lands back on the SITE_URL with the session set.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/feed' },
  })
  if (error) throw new Error(error.message)
}
