import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type NotificationType =
  | 'like' | 'comment' | 'reply' | 'comment_like' | 'reply_like'
  | 'gift' | 'gift_accepted' | 'gift_rejected' | 'match_post'
  | 'welcome' | 'welcome_signup'
  | 'deposit' | 'withdrawal' | 'withdrawal_sent' | 'withdrawal_rejected'
  | 'password_changed' | 'chat_reminder' | 'chat_message'
  | 'support_user_msg' | 'support_reply'
  | 'launch_bonus' | 'subscription_expired'

export type AppNotification = {
  id: string
  user_id: string
  actor_id: string | null
  type: NotificationType
  post_id: string | null
  comment_id: string | null
  conversation_id: string | null
  gift_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
  actor_handle: string | null
  actor_display_name: string | null
  actor_avatar_url: string | null
}

/** The signed-in user's notifications (newest first). */
export function useNotifications() {
  const session = useAuth((s) => s.session)
  return useQuery<AppNotification[]>({
    queryKey: ['notifications', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications_with_actor')
        .select('*')
        // Chat messages are push-only — they don't belong in the bell list.
        .neq('type', 'chat_message')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
  })
}

/** Unread badge count. Kept fresh by realtime (below). */
export function useUnreadNotifications() {
  const session = useAuth((s) => s.session)
  return useQuery<number>({
    queryKey: ['notifications:unread', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unread_notification_count')
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_notifications_read')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications:unread'] })
    },
  })
}

/** Subscribe to new notifications → refresh list + unread badge live. */
export function useNotificationsRealtime() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.session?.user.id ?? null)
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications'] })
          qc.invalidateQueries({ queryKey: ['notifications:unread'] })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, qc])
}
