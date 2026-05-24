import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type MessageMediaKind = 'image' | 'video' | 'audio'

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  created_at: string
  reply_to: string | null
  edited_at: string | null
  deleted_at: string | null
  read_by: string[]
  media_url: string | null
  media_kind: MessageMediaKind | null
  media_aspect: number | null
  /** Set true only for unsent optimistic rows that live in the cache. */
  pending?: boolean
  /** Set when the optimistic send failed; the UI can show a retry/error tick. */
  error?: boolean
}

export type MessagePages = InfiniteData<Message[]>

export const messagesKey = (convId: string) => ['messages', convId] as const

const MESSAGE_COLS =
  'id, conversation_id, sender_id, body, created_at, reply_to, edited_at, deleted_at, read_by, media_url, media_kind, media_aspect'

/**
 * Page size for the chat history. The first page is the newest N messages;
 * subsequent pages walk backwards in time as the user scrolls up.
 */
export const MESSAGE_PAGE_SIZE = 25

/**
 * Infinite history for a conversation, newest-first inside each page.
 *
 * - `data.pages[0]` = the newest N messages (newest-first).
 * - `data.pages[1]` = the next N older (newest-first within the page).
 * - `data.pages[k][N-1]` is the oldest message currently cached.
 *
 * To render top→bottom (oldest first, newest pinned to the composer),
 * flatten the pages and reverse — see ChatDetailScreen.
 */
export function useMessages(conversationId: string | null | undefined) {
  return useInfiniteQuery<
    Message[],
    Error,
    MessagePages,
    ReturnType<typeof messagesKey>,
    string | null
  >({
    queryKey: messagesKey(conversationId ?? '__none__'),
    enabled: !!conversationId,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('messages')
        .select(MESSAGE_COLS)
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Message[]
    },
    /** "Next" in TanStack terms is the older page; we keep going until a
     *  page comes back short — that's the end of the history. */
    getNextPageParam: (lastPage) => {
      if (lastPage.length < MESSAGE_PAGE_SIZE) return undefined
      return lastPage[lastPage.length - 1].created_at
    },
  })
}

export { MESSAGE_COLS }
