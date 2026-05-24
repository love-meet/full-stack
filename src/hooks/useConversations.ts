import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type Conversation = {
  id: string
  last_message_at: string | null
  last_message_preview: string | null
  last_sender_id: string | null
  my_last_read_at: string | null
  my_pinned_at: string | null
  other_id: string | null
  other_handle: string | null
  other_display_name: string | null
  other_avatar_url: string | null
  unread_count: number
}

export const conversationsKey = ['conversations'] as const
export const conversationKey = (id: string | null | undefined) =>
  ['conversation', id ?? null] as const

export function useConversations() {
  const session = useAuth((s) => s.session)
  return useQuery<Conversation[]>({
    queryKey: conversationsKey,
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_conversations')
        .select('*')
        // Pinned rows always first (most-recently-pinned at the top), then
        // the rest by last_message_at desc.
        .order('my_pinned_at',   { ascending: false, nullsFirst: false })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Conversation[]
    },
  })
}

export function useConversation(conversationId: string | null | undefined) {
  const session = useAuth((s) => s.session)
  return useQuery<Conversation | null>({
    queryKey: conversationKey(conversationId),
    enabled: !!session && !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_conversations')
        .select('*')
        .eq('id', conversationId!)
        .maybeSingle()
      if (error) throw error
      return (data as Conversation | null) ?? null
    },
  })
}
