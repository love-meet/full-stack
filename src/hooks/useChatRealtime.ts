import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { messagesKey, type Message, type MessagePages } from './useMessages'
import { conversationsKey, conversationKey } from './useConversations'
import { useAuth } from '../stores/auth'

/**
 * Subscribes to messages in a single conversation:
 *  - INSERT: prepend new rows to the newest page (page 0, which is
 *    newest-first). Dedup by id so the sender's optimistic-replaced row
 *    doesn't get duplicated.
 *  - UPDATE: merge edits, soft-deletes, and read_by[] mutations across
 *    every cached page so the bubble re-renders with "edited", deleted
 *    state, and the double-tick when the other side opens the chat.
 *
 * Also invalidates the conversations list so previews + unread counts move.
 */
export function useChatRealtime(conversationId: string | null | undefined) {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.session?.user.id ?? null)

  useEffect(() => {
    if (!conversationId) return
    const key = messagesKey(conversationId)

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message
          qc.setQueryData<MessagePages>(key, (old) => {
            if (!old) {
              return { pages: [[incoming]], pageParams: [null] }
            }
            // Already arrived (likely via the send mutation's onSuccess).
            const exists = old.pages.some((p) => p.some((m) => m.id === incoming.id))
            if (exists) return old
            // If this is OUR own message, an optimistic "pending" row may be
            // sitting in the cache from useSendMessage's onMutate. The send
            // RPC and Realtime can race — Realtime sometimes lands first and
            // we'd end up with a duplicate (pending + real, then the success
            // handler replaces pending → two real entries). Match the
            // optimistic row by content and REPLACE it in place instead.
            if (incoming.sender_id === myId) {
              const matches = (m: Message) =>
                !!m.pending &&
                m.sender_id === incoming.sender_id &&
                (m.body ?? null) === (incoming.body ?? null) &&
                (m.media_url ?? null) === (incoming.media_url ?? null)
              let replaced = false
              const pages = old.pages.map((page) =>
                page.map((m) => {
                  if (!replaced && matches(m)) { replaced = true; return incoming }
                  return m
                }),
              )
              if (replaced) return { ...old, pages }
            }
            const [first = [], ...rest] = old.pages
            return { ...old, pages: [[incoming, ...first], ...rest] }
          })
          qc.invalidateQueries({ queryKey: conversationsKey })
          // The first message in a brand-new DM makes the conversation appear
          // in my_conversations — refetch the header so the other person's
          // name + avatar populate (it was null before any message existed).
          qc.invalidateQueries({ queryKey: conversationKey(conversationId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          qc.setQueryData<MessagePages>(key, (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) =>
                page.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
              ),
            }
          })
          // Edits/deletes affect the preview in the conv list; read_by changes
          // don't — invalidating either way is cheap.
          qc.invalidateQueries({ queryKey: conversationsKey })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, qc, myId])
}

/**
 * Lightweight global subscription: refreshes the conversation list whenever
 * ANY of our conversations gets a new message or update. Mount once on
 * ChatScreen.
 */
export function useConversationsRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('conversations-broadcast')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => qc.invalidateQueries({ queryKey: conversationsKey }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => qc.invalidateQueries({ queryKey: conversationsKey }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])
}
