import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { conversationsKey } from './useConversations'

/**
 * Finds an existing 1-on-1 conversation with `otherUserId` or creates one.
 * Returns the conversation_id. Refreshes the conversation list on success.
 */
export function useStartDM() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('start_dm', { other_user_id: otherUserId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: conversationsKey }),
  })
}

/**
 * Marks the conversation read for me. Uses mark_messages_read which both
 * appends my id to each unread message's read_by[] (powers the double-tick
 * on the other side) and bumps conversation_members.last_read_at so the
 * unread badge in my_conversations clears.
 */
export async function markConversationRead(conversationId: string) {
  await supabase.rpc('mark_messages_read', { conversation_id: conversationId })
}
