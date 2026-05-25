import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'
import type { GroupPost } from './useGroupPosts'
import type {
  Deposit,
  WithdrawalRequest,
} from './usePayments'

export type AdminStats = {
  open_reports: number
  pending_payouts: number
  pending_deposits: number
  active_bans: number
  open_tickets: number
  admin_count: number
  user_count: number
}

export type PostReport = {
  id: string
  post_id: string
  reporter_id: string
  reason: 'spam' | 'inappropriate' | 'harassment' | 'underage' | 'illegal' | 'other'
  note: string | null
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
}

export type UserBan = {
  id: string
  user_id: string
  banned_by: string | null
  reason: string | null
  expires_at: string | null
  lifted_at: string | null
  created_at: string
}

/** True if the signed-in profile has role admin or super_admin. */
export function useIsAdmin(): boolean {
  const p = useProfile()
  const r = p.data?.role
  return r === 'admin' || r === 'super_admin'
}

export const pendingThreadsKey = ['admin:pending-threads'] as const

/**
 * All group threads/posts awaiting approval, across every group. Platform
 * admins see all pending posts (the moderation view grants is_group_admin to
 * them), so this powers a central approval queue in the admin panel.
 */
export function usePendingThreads() {
  return useQuery<GroupPost[]>({
    queryKey: pendingThreadsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_posts_with_counts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as GroupPost[]
    },
  })
}

/** Approve or reject a pending thread from the admin queue. */
export function useModeratePendingThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { postId: string; action: 'approve' | 'reject'; reason?: string }) => {
      if (vars.action === 'approve') {
        const { error } = await supabase.rpc('approve_group_post', { post_id: vars.postId })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('reject_group_post', {
          post_id: vars.postId,
          reason: vars.reason ?? null,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: pendingThreadsKey })
      qc.invalidateQueries({ queryKey: ['group-feed'] })
      qc.invalidateQueries({ queryKey: ['group-post', vars.postId] })
    },
  })
}

export function useIsSuperAdmin(): boolean {
  return useProfile().data?.role === 'super_admin'
}

// ============================================================================
// Dashboard
// ============================================================================

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin:stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_dashboard')
        .select('*')
        .single()
      if (error) throw error
      return data as AdminStats
    },
  })
}

// ============================================================================
// Moderation
// ============================================================================

export function useOpenReports() {
  return useQuery<PostReport[]>({
    queryKey: ['admin:reports', 'open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_reports')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as PostReport[]
    },
  })
}

export function useResolveReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      reportId: string
      nextStatus: 'resolved' | 'dismissed'
      note?: string
    }) => {
      const { data, error } = await supabase
        .rpc('resolve_report', {
          report_id: vars.reportId,
          next_status: vars.nextStatus,
          note: vars.note ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as PostReport
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:reports'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

// ============================================================================
// User management
// ============================================================================

export type AdminUserRow = {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  role: 'user' | 'admin' | 'super_admin'
  is_verified: boolean
  onboarded_at: string | null
  deleted_at: string | null
  created_at: string
}

export function useAdminUserSearch(q: string) {
  const term = q.trim()
  return useQuery<AdminUserRow[]>({
    queryKey: ['admin:users', term],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url, role, is_verified, onboarded_at, deleted_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (term) {
        const safe = term.replace(/[%,()*"\\]/g, '')
        const like = `%${safe}%`
        query = query.or(`handle.ilike.${like},display_name.ilike.${like}`)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as AdminUserRow[]
    },
  })
}

export function useBanUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      userId: string
      reason?: string | null
      expiresAt?: string | null
    }) => {
      const { data, error } = await supabase
        .rpc('ban_user', {
          target: vars.userId,
          reason: vars.reason ?? null,
          expires_at: vars.expiresAt ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as UserBan
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:bans'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

export function useLiftBan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('lift_ban', { target: userId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:bans'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

export function useSetRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; role: 'user' | 'admin' | 'super_admin' }) => {
      const { error } = await supabase.rpc('set_role', {
        target: vars.userId,
        next_role: vars.role,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:users'] })
    },
  })
}

export function useActiveBans() {
  return useQuery<UserBan[]>({
    queryKey: ['admin:bans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_bans')
        .select('*')
        .is('lifted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as UserBan[]
    },
  })
}

// ============================================================================
// Payouts (withdrawals + deposits oversight)
// ============================================================================

export function usePendingDeposits() {
  return useQuery<Deposit[]>({
    queryKey: ['admin:deposits', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposits')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Deposit[]
    },
  })
}

export function useMarkDepositPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { depositId: string; providerRef?: string }) => {
      const { data, error } = await supabase
        .rpc('mark_deposit_paid', {
          deposit_id: vars.depositId,
          ref: vars.providerRef ?? null,
          payload: null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Deposit
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:deposits'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

export function usePendingWithdrawals() {
  return useQuery<WithdrawalRequest[]>({
    queryKey: ['admin:withdrawals', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as WithdrawalRequest[]
    },
  })
}

export function useApproveWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reqId: string) => {
      const { data, error } = await supabase
        .rpc('approve_withdrawal', { req_id: reqId })
        .select('*')
        .single()
      if (error) throw error
      return data as WithdrawalRequest
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:withdrawals'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

export function useMarkWithdrawalSent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reqId: string; txHash: string }) => {
      const { data, error } = await supabase
        .rpc('mark_withdrawal_sent', { req_id: vars.reqId, tx_hash: vars.txHash })
        .select('*')
        .single()
      if (error) throw error
      return data as WithdrawalRequest
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:withdrawals'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

export function useRejectWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reqId: string; reason: string }) => {
      const { data, error } = await supabase
        .rpc('reject_withdrawal', { req_id: vars.reqId, reason: vars.reason })
        .select('*')
        .single()
      if (error) throw error
      return data as WithdrawalRequest
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin:withdrawals'] })
      qc.invalidateQueries({ queryKey: ['admin:stats'] })
    },
  })
}

// ============================================================================
// All ledger entries (admin transactions view)
// ============================================================================

export function useAdminLedger() {
  return useQuery({
    queryKey: ['admin:ledger'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })
}
