import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Live connection tracking for a game via Supabase Realtime presence. Everyone
 * viewing the game (players + spectators) joins a per-game presence channel
 * keyed by their user id; when someone closes the tab or drops connection,
 * presence removes them. Returns the Set of currently-connected user ids, so
 * the lobby/match can show who's online and who has left.
 */
export function useGamePresence(gameId: string | undefined, userId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!gameId || !userId) return
    const channel = supabase.channel(`game-presence-${gameId}`, {
      config: { presence: { key: userId } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>
      const ids = new Set<string>()
      for (const key of Object.keys(state)) {
        if (Array.isArray(state[key]) && state[key].length > 0) ids.add(key)
      }
      setOnline(ids)
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() })
    })

    return () => { void supabase.removeChannel(channel) }
  }, [gameId, userId])

  return online
}
