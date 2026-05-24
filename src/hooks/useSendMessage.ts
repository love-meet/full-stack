import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import {
  messagesKey,
  MESSAGE_COLS,
  type Message,
  type MessageMediaKind,
  type MessagePages,
} from './useMessages'
import { conversationKey, conversationsKey } from './useConversations'

type SendVars = {
  /** Caption / text. Optional when media is present; required otherwise. */
  body?: string | null
  /** Optional id of the message being replied to. */
  replyTo?: string | null
  media?: {
    url: string
    kind: MessageMediaKind
    aspect: number
  } | null
}

function patchPages(
  old: MessagePages | undefined,
  fn: (m: Message) => Message,
): MessagePages | undefined {
  if (!old) return old
  return { ...old, pages: old.pages.map((page) => page.map(fn)) }
}

export function useSendMessage(conversationId: string) {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  const key = messagesKey(conversationId)

  return useMutation({
    mutationFn: async (vars: SendVars) => {
      if (!session) throw new Error('not signed in')
      const body = vars.body?.trim() || null
      const hasMedia = !!vars.media
      if (!body && !hasMedia) throw new Error('Empty message')

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id:    session.user.id,
          body,
          reply_to:     vars.replyTo ?? null,
          media_url:    vars.media?.url ?? null,
          media_kind:   vars.media?.kind ?? null,
          media_aspect: vars.media?.aspect ?? null,
        })
        .select(MESSAGE_COLS)
        .single()
      if (error) throw error
      return data as Message
    },
    onMutate: async (vars) => {
      if (!session) return
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<MessagePages>(key)
      const optimistic: Message = {
        id: `pending-${crypto.randomUUID()}`,
        conversation_id: conversationId,
        sender_id:    session.user.id,
        body:         vars.body?.trim() || null,
        created_at:   new Date().toISOString(),
        reply_to:     vars.replyTo ?? null,
        edited_at:    null,
        deleted_at:   null,
        read_by:      [],
        media_url:    vars.media?.url ?? null,
        media_kind:   vars.media?.kind ?? null,
        media_aspect: vars.media?.aspect ?? null,
        pending: true,
      }
      qc.setQueryData<MessagePages>(key, (old) => {
        if (!old) return { pages: [[optimistic]], pageParams: [null] }
        const [first = [], ...rest] = old.pages
        return { ...old, pages: [[optimistic, ...first], ...rest] }
      })
      return { prev, optimisticId: optimistic.id }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return
      qc.setQueryData<MessagePages>(key, (old) =>
        patchPages(old, (m) =>
          m.id === ctx.optimisticId ? { ...m, pending: false, error: true } : m,
        ),
      )
    },
    onSuccess: (sent, _vars, ctx) => {
      qc.setQueryData<MessagePages>(key, (old) =>
        patchPages(old, (m) => (m.id === ctx?.optimisticId ? sent : m)),
      )
      // First message in a new DM populates my_conversations — refresh the
      // header (name/avatar) and the conversations list.
      qc.invalidateQueries({ queryKey: conversationKey(conversationId) })
      qc.invalidateQueries({ queryKey: conversationsKey })
    },
  })
}
