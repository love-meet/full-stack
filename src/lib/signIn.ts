import { supabase } from './supabase'
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

  const { data, error } = await supabase.functions.invoke<{ action_url: string }>(
    'auth-telegram',
    { body: { initData } },
  )
  if (error) throw new Error(error.message)
  if (!data?.action_url) throw new Error('Edge function returned no action_url.')

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
  // DEV BYPASS: Local Supabase doesn't have Google OAuth credentials configured by default.
  // When testing locally, we'll just instantly generate a new test user account instead!
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const { error } = await supabase.auth.signUp({
      email: `test_${Date.now()}@lovemeet.local`,
      password: 'password123',
    })
    if (error) throw new Error(error.message)
    // The session is now active.
    return
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/feed' },
  })
  if (error) throw new Error(error.message)
}
