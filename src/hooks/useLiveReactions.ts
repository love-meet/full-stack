import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type LiveComment = { id: string; name: string; text: string; at: number }
export type LiveEmoji = { id: string; emoji: string; at: number }

let seq = 0
const uid = () => `${Date.now()}-${seq++}`

/**
 * Instagram-Live-style ephemeral reactions for a game: comments that rise up
 * the screen and emoji that float away. Everyone watching or playing a game
 * shares one Realtime broadcast channel — nothing is persisted, the messages
 * just fly by. `self: true` so the sender sees their own reaction too.
 */
export function useLiveReactions(gameId: string | undefined) {
  const [comments, setComments] = useState<LiveComment[]>([])
  const [emojis, setEmojis] = useState<LiveEmoji[]>([])
  const chRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!gameId) return
    const ch = supabase.channel(`game-live-${gameId}`, { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'comment' }, ({ payload }) => {
      const p = payload as { id: string; name: string; text: string }
      setComments((prev) => [...prev.slice(-30), { ...p, at: Date.now() }])
    })
    ch.on('broadcast', { event: 'emoji' }, ({ payload }) => {
      const p = payload as { id: string; emoji: string }
      setEmojis((prev) => [...prev.slice(-24), { ...p, at: Date.now() }])
    })
    ch.subscribe()
    chRef.current = ch
    return () => { void supabase.removeChannel(ch); chRef.current = null }
  }, [gameId])

  const sendComment = useCallback((name: string, text: string) => {
    const t = text.trim().slice(0, 200)
    if (!t) return
    chRef.current?.send({ type: 'broadcast', event: 'comment', payload: { id: uid(), name, text: t } })
  }, [])

  const sendEmoji = useCallback((emoji: string) => {
    chRef.current?.send({ type: 'broadcast', event: 'emoji', payload: { id: uid(), emoji } })
  }, [])

  const removeComment = useCallback((id: string) => setComments((p) => p.filter((c) => c.id !== id)), [])
  const removeEmoji = useCallback((id: string) => setEmojis((p) => p.filter((e) => e.id !== id)), [])

  return { comments, emojis, sendComment, sendEmoji, removeComment, removeEmoji }
}
