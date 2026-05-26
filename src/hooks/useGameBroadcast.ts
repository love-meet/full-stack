import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type BoardProgress = { order: number[]; done: boolean }

/**
 * Live board sharing for a game. Players broadcast their current tile order so
 * spectators (and opponents) can watch each board move in real time. Only
 * round RESULTS are persisted in the DB; this ephemeral progress goes over a
 * Realtime broadcast channel (throttled), never the database.
 */
export function useGameBroadcast(gameId: string | undefined) {
  const [progress, setProgress] = useState<Map<string, BoardProgress>>(new Map())
  const chRef = useRef<RealtimeChannel | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    if (!gameId) return
    const ch = supabase.channel(`game-progress-${gameId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'progress' }, ({ payload }) => {
      const p = payload as { userId: string; order: number[]; done: boolean }
      setProgress((prev) => {
        const m = new Map(prev)
        m.set(p.userId, { order: p.order, done: p.done })
        return m
      })
    })
    ch.subscribe()
    chRef.current = ch
    return () => { void supabase.removeChannel(ch); chRef.current = null }
  }, [gameId])

  // Throttle to ~7/sec while playing; always send the final "done" frame.
  const sendProgress = useCallback((userId: string, order: number[], done: boolean) => {
    const now = Date.now()
    if (!done && now - lastSent.current < 140) return
    lastSent.current = now
    chRef.current?.send({ type: 'broadcast', event: 'progress', payload: { userId, order, done } })
  }, [])

  return { progress, sendProgress }
}
