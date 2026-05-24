import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { messagesKey, MESSAGE_COLS, type Message, type MessagePages } from './useMessages'
import { conversationsKey } from './useConversations'

function patchPages(
  old: MessagePages | undefined,
  fn: (m: Message) => Message,
): MessagePages | undefined {
  if (!old) return old
  return { ...old, pages: old.pages.map((page) => page.map(fn)) }
}

/** Edit your own message. Optimistic. Calls the edit_message RPC. */
export function useEditMessage(conversationId: string) {
  const qc = useQueryClient()
  const key = messagesKey(conversationId)

  return useMutation({
    mutationFn: async (vars: { messageId: string; body: string }) => {
      const { data, error } = await supabase
        .rpc('edit_message', { message_id: vars.messageId, new_body: vars.body })
        .select(MESSAGE_COLS)
        .single()
      if (error) throw error
      return data as Message
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<MessagePages>(key)
      qc.setQueryData<MessagePages>(key, (old) =>
        patchPages(old, (m) =>
          m.id === vars.messageId
            ? { ...m, body: vars.body, edited_at: new Date().toISOString() }
            : m,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationsKey })
    },
  })
}

/** Soft-delete your own message. Optimistic. Calls the delete_message RPC. */
export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient()
  const key = messagesKey(conversationId)

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .rpc('delete_message', { message_id: messageId })
        .select(MESSAGE_COLS)
        .single()
      if (error) throw error
      return data as Message
    },
    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<MessagePages>(key)
      qc.setQueryData<MessagePages>(key, (old) =>
        patchPages(old, (m) =>
          m.id === messageId
            ? { ...m, body: null, deleted_at: new Date().toISOString() }
            : m,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationsKey })
    },
  })
}

/**
 * Mark every unread message in this conversation as read by me.
 * Fires the mark_messages_read RPC which both appends my id to read_by[]
 * and bumps conversation_members.last_read_at so the unread badge clears.
 *
 * Used by ChatDetailScreen on mount + whenever the message list grows.
 */
export async function markMessagesReadFor(conversationId: string) {
  const { error } = await supabase.rpc('mark_messages_read', {
    conversation_id: conversationId,
  })
  if (error) {
    if (typeof console !== 'undefined') console.warn('mark_messages_read failed', error)
  }
}

/**
 * Hook variant for the hot path: applies the read locally to the cache
 * immediately, then calls the RPC. Caches show the double-tick on my own
 * messages as soon as the other person opens the conversation, because
 * realtime delivers their messages.read_by UPDATE.
 */
export function useMarkMessagesRead(conversationId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return async () => {
    if (!conversationId || !session) return
    await markMessagesReadFor(conversationId)
  }
}
