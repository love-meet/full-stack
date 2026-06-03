import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { playPing } from '../lib/sound'
import { showBrowserNotification } from './useBrowserNotifications'

type NotifRow = {
  type: string
  body: string | null
  conversation_id: string | null
  actor_id: string | null
}

const stripAt = (s: string | null) => (s ? s.replace(/^@+/, '') : null)

/**
 * Mount once at the app root. Listens for the signed-in user's incoming
 * notifications and, for new chat messages, plays a sound (always) and shows a
 * browser notification (when the tab isn't focused). Online users are alerted
 * here; offline users are emailed instead (decided server-side in notify-email).
 */
export function useIncomingMessageAlerts() {
  const userId = useAuth((s) => s.session?.user.id ?? null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`alerts-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as NotifRow
          // Keep the bell badge fresh wherever the user is.
          qc.invalidateQueries({ queryKey: ['notifications:unread'] })
          qc.invalidateQueries({ queryKey: ['notifications'] })

          if (n.type !== 'chat_message') return
          // Don't ping if they're already reading this very conversation.
          const here = n.conversation_id && window.location.pathname.endsWith(`/chat/${n.conversation_id}`)
          if (here) return

          playPing()
          if (document.visibilityState !== 'visible') {
            // Fetch actor avatar + name so the notification carries the
            // sender's face and is titled "<name> sent you a message" rather
            // than the generic "New message". One quick query per ping.
            void (async () => {
              let actorAvatar: string | null = null
              let actorName: string | null = null
              if (n.actor_id) {
                const { data: a } = await supabase
                  .from('profiles')
                  .select('display_name, first_name, handle, avatar_url')
                  .eq('id', n.actor_id)
                  .maybeSingle()
                if (a) {
                  actorName = a.display_name?.trim()
                    || a.first_name?.trim()
                    || stripAt(a.handle)
                    || null
                  actorAvatar = a.avatar_url ?? null
                }
              }
              const title = actorName
                ? `${actorName} sent you a message 💬`
                : 'New message 💬'
              showBrowserNotification(
                title,
                n.body ?? 'You have a new message on Love meet.',
                () => { if (n.conversation_id) navigate(`/chat/${n.conversation_id}`) },
                actorAvatar,
              )
            })()
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, navigate, qc])
}
