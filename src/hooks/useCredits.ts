import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

/** $2 = 2,000 credits. */
export const CREDITS_PER_USD = 1000
/** Charged on the first message sent in a day. */
export const DAILY_MESSAGE_COST = 100
/** What a new account starts with — 10 free days of messaging. */
export const SIGNUP_CREDITS = 1000

export type CreditKind =
  | 'signup_grant'
  | 'message_day'
  | 'purchase'
  | 'gift_received'
  | 'admin_adjust'

export type CreditEntry = {
  id: string
  user_id: string
  kind: CreditKind
  delta: number
  balance_after: number
  ref_table: string | null
  ref_id: string | null
  note: string | null
  created_at: string
}

const PAGE = 30

export const creditsKey = (userId: string | null) => ['credits', userId] as const
export const creditHistoryKey = (userId: string | null) => ['credit-history', userId] as const

/** The signed-in user's credit balance. Rides on profiles.coins. */
export function useCredits() {
  const session = useAuth((s) => s.session)
  return useQuery<number>({
    queryKey: creditsKey(session?.user.id ?? null),
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', session!.user.id)
        .single()
      if (error) throw error
      return Number((data as { coins: number }).coins ?? 0)
    },
  })
}

/** Append-only history. No money language: these are credits, not a balance. */
export function useCreditHistory() {
  const session = useAuth((s) => s.session)
  return useInfiniteQuery<
    CreditEntry[],
    Error,
    InfiniteData<CreditEntry[]>,
    ReturnType<typeof creditHistoryKey>,
    string | null
  >({
    queryKey: creditHistoryKey(session?.user.id ?? null),
    enabled: !!session,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('coin_ledger')
        .select('*')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as CreditEntry[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : last[last.length - 1].created_at,
  })
}

/** Live balance — the chip updates the moment a credit moves. */
export function useCreditsRealtime() {
  const session = useAuth((s) => s.session)
  const qc = useQueryClient()
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel(`credits:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'coin_ledger',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const row = payload.new as CreditEntry
          qc.setQueryData(creditsKey(session.user.id), row.balance_after)
          qc.invalidateQueries({ queryKey: creditHistoryKey(session.user.id) })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [session, qc])
}

/**
 * Thrown when the daily messaging charge can't be paid. Carried as its own
 * type so the composer can offer to buy credits instead of showing a raw
 * Postgres error.
 */
export class InsufficientCredits extends Error {
  constructor() {
    super('insufficient_credits')
    this.name = 'InsufficientCredits'
  }
}

export function isInsufficientCredits(e: unknown): boolean {
  return e instanceof InsufficientCredits ||
    (e instanceof Error && e.message.includes('insufficient_credits'))
}

/**
 * Pay for today's messaging, if today hasn't been paid for yet.
 *
 * Call before the first message send; calling it again the same day is free
 * and succeeds — the RPC is idempotent per user per day, enforced server-side
 * so the client can be as naive as it likes.
 */
export async function spendDailyMessageCredit(): Promise<{ balance: number; charged: boolean }> {
  const { data, error } = await supabase.rpc('spend_daily_message_credit')
  if (error) {
    if (error.message.includes('insufficient_credits')) throw new InsufficientCredits()
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as { balance: number; charged: boolean } | null
  return { balance: Number(row?.balance ?? 0), charged: !!row?.charged }
}

/** Record a completed credit purchase. Idempotent on the transaction id. */
export function useRecordCreditPurchase() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: {
      transactionId: string
      amountUsd: number
      completed: boolean
      payload?: unknown
    }): Promise<number> => {
      const { data, error } = await supabase.rpc('record_credit_purchase', {
        p_transaction_id: vars.transactionId,
        p_amount_usd: vars.amountUsd,
        p_completed: vars.completed,
        p_payload: (vars.payload ?? null) as object | null,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: (balance) => {
      qc.setQueryData(creditsKey(session?.user.id ?? null), balance)
      qc.invalidateQueries({ queryKey: creditHistoryKey(session?.user.id ?? null) })
    },
  })
}

/** Human label for a ledger row. Credits only — no money language. */
export function creditLabel(kind: CreditKind, note?: string | null): string {
  // The two migration rows every existing user has are both admin_adjust, so
  // the kind alone renders them as a pair of mysterious "Adjustment" entries
  // that net to zero. The note says what actually happened — use it.
  if (kind === 'admin_adjust' && note) {
    if (note.startsWith('Opening balance')) return 'Your old balance'
    if (note.startsWith('Reset from'))      return 'Old coins cleared'
  }
  switch (kind) {
    case 'signup_grant':  return 'Welcome coins'
    case 'message_day':   return "A day's messaging"
    case 'purchase':      return 'Coins added'
    case 'gift_received': return 'Gift received'
    case 'admin_adjust':  return 'Adjustment'
  }
}

/** One line of plain explanation, where a row needs one. */
export function creditNote(kind: CreditKind, note?: string | null): string | null {
  if (kind !== 'admin_adjust' || !note) return null
  if (note.startsWith('Opening balance')) {
    return 'Carried over from your old balance'
  }
  if (note.startsWith('Reset from')) {
    return 'Replaced by your 1,000 welcome coins'
  }
  return null
}

export function creditGlyph(kind: CreditKind): string {
  switch (kind) {
    case 'signup_grant':  return '🎉'
    case 'message_day':   return '💬'
    case 'purchase':      return '＋'
    case 'gift_received': return '🎁'
    case 'admin_adjust':  return '⚙'
  }
}
