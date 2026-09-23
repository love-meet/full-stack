import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

/**
 * Relationship tips and topics (HS-LM-v1 §01, §05).
 *
 * Tips are written by us and read-only. Topics are opened by anyone. They
 * come from one table and one RPC because the reading surface is identical —
 * the only real difference is who may create one.
 */
export type TopicKind = 'tip' | 'topic'

export type Topic = {
  id: string
  kind: TopicKind
  author_id: string | null
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  title: string
  body: string
  reply_count: number
  created_at: string
  is_mine: boolean
}

export type TopicReply = {
  id: string
  author_id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  body: string
  created_at: string
  is_mine: boolean
}

export const topicsKey = (kind: TopicKind) => ['topics', kind] as const
export const repliesKey = (id: string) => ['topic-replies', id] as const

export function useTopics(kind: TopicKind) {
  const session = useAuth((s) => s.session)
  return useQuery<Topic[]>({
    queryKey: topicsKey(kind),
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_topics', {
        p_kind: kind, p_limit: 50, p_offset: 0,
      })
      if (error) throw error
      return (data ?? []) as Topic[]
    },
  })
}

export function useTopicReplies(topicId: string, enabled = true) {
  const session = useAuth((s) => s.session)
  return useQuery<TopicReply[]>({
    queryKey: repliesKey(topicId),
    enabled: !!session && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_topic_replies', { p_topic: topicId })
      if (error) throw error
      return (data ?? []) as TopicReply[]
    },
  })
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { title: string; body: string }) => {
      const { data, error } = await supabase.rpc('create_topic', {
        p_title: v.title, p_body: v.body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey('topic') }),
  })
}

export function useReplyToTopic(topicId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc('reply_to_topic', { p_topic: topicId, p_body: body })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repliesKey(topicId) })
      qc.invalidateQueries({ queryKey: topicsKey('topic') })
    },
  })
}

export function useDeleteTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_topic', { p_topic: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey('topic') }),
  })
}
