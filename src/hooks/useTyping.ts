import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

const BUS = 'typing-bus'
const EVENT = 'typing'
const STOP_TIMEOUT_MS = 3000 // auto-clear if the other side stops emitting

type TypingPayload = {
  from: string
  conversation_id: string
  active: boolean
}

/**
 * One channel ↔ many listeners. Both the detail screen and the chat list
 * subscribe to the same `typing-bus` and filter the payload by
 * `conversation_id`, so we don't spin up one channel per visible row.
 *
 * The channel is owned by a tiny module-level registry; consumers attach
 * an event callback via `subscribe()` and the registry tears the channel
 * down when the last listener leaves.
 */

type Listener = (p: TypingPayload) => void
let busChannel: RealtimeChannel | null = null
const busListeners = new Set<Listener>()

function ensureBus() {
  if (busChannel) return busChannel
  busChannel = supabase
    .channel(BUS, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: EVENT }, (msg) => {
      const p = msg.payload as TypingPayload
      busListeners.forEach((cb) => cb(p))
    })
  busChannel.subscribe()
  return busChannel
}

function subscribe(cb: Listener) {
  ensureBus()
  busListeners.add(cb)
  return () => {
    busListeners.delete(cb)
    if (busListeners.size === 0 && busChannel) {
      void supabase.removeChannel(busChannel)
      busChannel = null
    }
  }
}

async function emit(payload: TypingPayload) {
  const ch = ensureBus()
  await ch.send({ type: 'broadcast', event: EVENT, payload })
}

/**
 * Conversation-detail hook. Returns whether the other side is typing in THIS
 * conversation plus stable `notifyTyping`/`notifyStopped` callbacks.
 */
export function useTyping(conversationId: string | null | undefined) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const [theyAreTyping, setTheyAreTyping] = useState(false)
  const lastEmitRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!conversationId || !myId) return
    setTheyAreTyping(false)

    const unsub = subscribe((p) => {
      if (p.conversation_id !== conversationId) return
      if (p.from === myId) return
      setTheyAreTyping(p.active)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (p.active) {
        timerRef.current = window.setTimeout(
          () => setTheyAreTyping(false),
          STOP_TIMEOUT_MS,
        )
      }
    })

    return () => {
      unsub()
      if (timerRef.current) window.clearTimeout(timerRef.current)
      setTheyAreTyping(false)
    }
  }, [conversationId, myId])

  function notifyTyping() {
    if (!conversationId || !myId) return
    const now = Date.now()
    if (now - lastEmitRef.current < 1500) return // throttle keystrokes
    lastEmitRef.current = now
    void emit({ from: myId, conversation_id: conversationId, active: true })
  }

  function notifyStopped() {
    if (!conversationId || !myId) return
    lastEmitRef.current = 0
    void emit({ from: myId, conversation_id: conversationId, active: false })
  }

  return { theyAreTyping, notifyTyping, notifyStopped }
}

/**
 * Conversation-list hook. Returns a Map<conversationId, true> for every
 * conversation where someone OTHER than me is currently typing.
 */
export function useTypingMap() {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const [map, setMap] = useState<Record<string, true>>({})
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!myId) return

    const unsub = subscribe((p) => {
      if (p.from === myId) return
      const convId = p.conversation_id
      const timers = timersRef.current
      const existing = timers.get(convId)
      if (existing) window.clearTimeout(existing)

      if (p.active) {
        setMap((m) => (m[convId] ? m : { ...m, [convId]: true }))
        timers.set(
          convId,
          window.setTimeout(() => {
            setMap((m) => {
              if (!m[convId]) return m
              const next = { ...m }
              delete next[convId]
              return next
            })
            timers.delete(convId)
          }, STOP_TIMEOUT_MS),
        )
      } else {
        timers.delete(convId)
        setMap((m) => {
          if (!m[convId]) return m
          const next = { ...m }
          delete next[convId]
          return next
        })
      }
    })

    return () => {
      unsub()
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current.clear()
    }
  }, [myId])

  return map
}
