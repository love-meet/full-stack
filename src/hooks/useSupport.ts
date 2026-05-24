import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type SupportStatus = 'open' | 'resolved' | 'closed'

export type SupportTicket = {
  id: string
  user_id: string
  subject: string
  status: SupportStatus
  last_message_at: string
  last_message_preview: string | null
  last_sender_is_admin: boolean
  user_last_read_at: string | null
  admin_last_read_at: string | null
  created_at: string
  user_handle: string | null
  user_display_name: string | null
  user_avatar_url: string | null
  user_unread: number
  admin_unread: number
}

export type SupportMessage = {
  id: string
  ticket_id: string
  sender_id: string | null
  is_admin: boolean
  body: string
  created_at: string
}

const TICKET_COLS = '*'

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** The signed-in user's own support tickets (newest activity first). */
export function useMyTickets() {
  const session = useAuth((s) => s.session)
  return useQuery<SupportTicket[]>({
    queryKey: ['support:mine', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets_view')
        .select(TICKET_COLS)
        .eq('user_id', session!.user.id)
        .order('last_message_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as SupportTicket[]
    },
  })
}

/** Admin inbox: every ticket, optionally filtered by status. */
export function useAllTickets(status: SupportStatus | 'all') {
  return useQuery<SupportTicket[]>({
    queryKey: ['support:all', status],
    queryFn: async () => {
      let q = supabase
        .from('support_tickets_view')
        .select(TICKET_COLS)
        .order('last_message_at', { ascending: false })
        .limit(200)
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SupportTicket[]
    },
  })
}

/** A single ticket (works for both the owner and admins). */
export function useTicket(ticketId: string | undefined) {
  return useQuery<SupportTicket | null>({
    queryKey: ['support:ticket', ticketId ?? null],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets_view')
        .select(TICKET_COLS)
        .eq('id', ticketId!)
        .maybeSingle()
      if (error) throw error
      return (data as SupportTicket | null) ?? null
    },
  })
}

export function useTicketMessages(ticketId: string | undefined) {
  return useQuery<SupportMessage[]>({
    queryKey: ['support:messages', ticketId ?? null],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as SupportMessage[]
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useOpenTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { subject: string; message: string }) => {
      const { data, error } = await supabase
        .rpc('open_support_ticket', { subject: vars.subject, first_message: vars.message })
        .select('*')
        .single()
      if (error) throw error
      return data as { id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support:mine'] })
      qc.invalidateQueries({ queryKey: ['support:all'] })
    },
  })
}

export function useSendSupportMessage(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase
        .rpc('send_support_message', { ticket_id: ticketId, body })
        .select('*')
        .single()
      if (error) throw error
      return data as SupportMessage
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support:messages', ticketId] })
      qc.invalidateQueries({ queryKey: ['support:ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['support:mine'] })
      qc.invalidateQueries({ queryKey: ['support:all'] })
    },
  })
}

export function useSetTicketStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { ticketId: string; status: SupportStatus }) => {
      const { data, error } = await supabase
        .rpc('set_support_status', { ticket_id: vars.ticketId, next_status: vars.status })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['support:ticket', vars.ticketId] })
      qc.invalidateQueries({ queryKey: ['support:all'] })
      qc.invalidateQueries({ queryKey: ['support:mine'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

/** Fire-and-forget: mark a ticket read for the current side. */
export async function markTicketRead(ticketId: string) {
  await supabase.rpc('mark_support_read', { ticket_id: ticketId })
}

// ---------------------------------------------------------------------------
// Realtime — new messages in a ticket + ticket-list bumps.
// ---------------------------------------------------------------------------

export function useTicketRealtime(ticketId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!ticketId) return
    const channel = supabase
      .channel(`support-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['support:messages', ticketId] })
          qc.invalidateQueries({ queryKey: ['support:ticket', ticketId] })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
        () => qc.invalidateQueries({ queryKey: ['support:ticket', ticketId] }),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [ticketId, qc])
}

/** Subscribe to all ticket changes — used by the list screens for badges. */
export function useTicketsRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('support-tickets-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => {
          qc.invalidateQueries({ queryKey: ['support:mine'] })
          qc.invalidateQueries({ queryKey: ['support:all'] })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [qc])
}
