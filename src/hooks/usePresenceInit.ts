import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { usePresence } from '../stores/presence'

const CHANNEL = 'presence-global'

/**
 * Mount once at the app root (Shell). When a user is signed in, joins a
 * single Supabase Realtime presence channel that tracks `{ user_id }` per
 * connected client, and publishes the resulting "who's online" set into
 * the `usePresence` Zustand store.
 *
 * Anywhere else in the app, use `useIsOnline(userId)` to render a dot.
 */
export function usePresenceInit() {
  const session = useAuth((s) => s.session)
  const setOnline = usePresence((s) => s.setOnline)
  const myId = session?.user.id ?? null

  useEffect(() => {
    if (!myId) {
      setOnline(new Set())
      return
    }

    const channel = supabase.channel(CHANNEL, {
      config: { presence: { key: myId } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>
      const ids = new Set<string>()
      for (const key of Object.keys(state)) {
        // Only count the key if there's at least one live tracker for it.
        const entries = state[key]
        if (Array.isArray(entries) && entries.length > 0) ids.add(key)
      }
      setOnline(ids)
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ at: new Date().toISOString() })
      }
    })

    // DB heartbeat so the server (notify-email) knows we're online: stamp
    // last_seen_at now, every 25s, and whenever the tab becomes visible.
    const touch = () => { void supabase.rpc('touch_last_seen') }
    touch()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') touch()
    }, 25_000)
    const onVisible = () => { if (document.visibilityState === 'visible') touch() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
      setOnline(new Set())
    }
  }, [myId, setOnline])
}
