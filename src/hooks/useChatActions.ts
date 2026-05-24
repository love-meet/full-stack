import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { conversationsKey } from './useConversations'

/** Pin or unpin the conversation for me. Returns the new `pinned_at`
 *  (or null if just unpinned). */
export function useTogglePinConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.rpc('toggle_pin_conversation', {
        conversation_id: conversationId,
      })
      if (error) throw error
      return data as string | null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationsKey })
      qc.invalidateQueries({ queryKey: ['conversation'] })
    },
  })
}

/** Bump my last_read_at backwards so the conversation shows unread again. */
export function useMarkConversationUnread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_conversation_unread', {
        conversation_id: conversationId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationsKey })
      qc.invalidateQueries({ queryKey: ['conversation'] })
    },
  })
}
