import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

export type LedgerKind =
  | 'gift_sent'
  | 'gift_received'
  | 'tip_sent'
  | 'tip_received'
  | 'referral_bonus'
  | 'deposit'
  | 'withdrawal'
  | 'adjustment'

export type LedgerDirection = 'credit' | 'debit'

export type LedgerEntry = {
  id: string
  user_id: string
  kind: LedgerKind
  direction: LedgerDirection
  amount_usdt: number
  ref_table: string | null
  ref_id: string | null
  note: string | null
  created_at: string
}

export type Wallet = {
  user_id: string
  balance_usdt: number
  updated_at: string
}

export const walletKey = (userId: string | null) => ['wallet', userId] as const
export const ledgerKey = (userId: string | null, filter: LedgerFilter) =>
  ['ledger', userId, filter] as const

export type EarningsSummary = {
  lifetime_earnings: number
  earnings_30d: number
}

/** Lifetime + last-30-day earnings (gifts/tips/referrals received). */
export function useEarningsSummary() {
  const session = useAuth((s) => s.session)
  return useQuery<EarningsSummary>({
    queryKey: ['earnings_summary', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_earnings_summary')
        .select('lifetime_earnings, earnings_30d')
        .maybeSingle()
      if (error) throw error
      return (data as EarningsSummary | null) ?? { lifetime_earnings: 0, earnings_30d: 0 }
    },
  })
}

const LEDGER_PAGE = 30

export type LedgerFilter = {
  direction?: LedgerDirection
  kinds?: LedgerKind[]
}

/** Cached balance + last-updated time. Real-time updates flow in via
 *  `useWalletRealtime` (called once at the top of the wallet screen). */
export function useWallet() {
  const session = useAuth((s) => s.session)
  const userId = session?.user.id ?? null
  return useQuery<Wallet | null>({
    queryKey: walletKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('user_id, balance_usdt, updated_at')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      // First-time read: row doesn't exist yet — represent as zero.
      return (data as Wallet | null) ?? {
        user_id: userId!,
        balance_usdt: 0,
        updated_at: new Date().toISOString(),
      }
    },
  })
}

/** Paginated ledger feed for the signed-in user. */
export function useLedger(filter: LedgerFilter = {}) {
  const session = useAuth((s) => s.session)
  const userId = session?.user.id ?? null
  return useInfiniteQuery<
    LedgerEntry[],
    Error,
    InfiniteData<LedgerEntry[]>,
    ReturnType<typeof ledgerKey>,
    string | null
  >({
    queryKey: ledgerKey(userId, filter),
    enabled: !!userId,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('ledger_entries')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(LEDGER_PAGE)
      if (filter.direction) q = q.eq('direction', filter.direction)
      if (filter.kinds?.length) q = q.in('kind', filter.kinds)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LedgerEntry[]
    },
    getNextPageParam: (last) =>
      last.length < LEDGER_PAGE ? undefined : last[last.length - 1].created_at,
  })
}

/**
 * Subscribes to my wallets row + my new ledger entries. Updates the
 * cached balance immediately when a credit/debit lands. Mount on
 * WalletScreen/EarningsScreen.
 */
export function useWalletRealtime() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`wallet-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          qc.setQueryData<Wallet | null>(walletKey(userId), payload.new as Wallet)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger_entries',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Just nuke the ledger queries — easier than surgically inserting
          // into the right paginated bucket, and ledger entries are rare.
          qc.invalidateQueries({ queryKey: ['ledger', userId] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])
}
