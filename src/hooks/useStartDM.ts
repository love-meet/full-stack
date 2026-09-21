import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { conversationsKey } from './useConversations'

/** Thrown when today's 20 new conversations are used up (migration 0098). */
export function isDailyChatLimit(e: unknown): boolean {
  return e instanceof Error && e.message.includes('daily_new_chat_limit')
}

/**
 * Finds an existing 1-on-1 conversation with `otherUserId` or creates one.
 * Returns the conversation_id. Refreshes the conversation list on success.
 *
 * No mutual match is required (Victor, 20 Sep) — credits gate messaging, not
 * matching. Starting NEW conversations is capped at 20 a day server-side, so
 * one day's credits cannot buy a cold-message run through the whole feed;
 * replying and continuing existing chats stays unlimited.
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
