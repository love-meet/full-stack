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
}

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
            showBrowserNotification(
              'New message 💬',
              n.body ?? 'You have a new message on Love meet.',
              () => { if (n.conversation_id) navigate(`/chat/${n.conversation_id}`) },
            )
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, navigate, qc])
}
