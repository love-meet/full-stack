import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { walletKey } from './useWallet'

export type PaymentProvider = 'wema' | 'flutterwave' | 'ccpayment' | 'manual' | 'alatpay'
export type DepositStatus = 'pending' | 'paid' | 'failed' | 'cancelled'
export type WithdrawalStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed'

export type Deposit = {
  id: string
  user_id: string
  amount_usdt: number
  amount_local: number | null
  currency_local: string | null
  provider: PaymentProvider
  provider_ref: string | null
  status: DepositStatus
  paid_at: string | null
  note: string | null
  created_at: string
}

export type WithdrawalRequest = {
  id: string
  user_id: string
  amount_usdt: number
  destination: string
  payout_amount_local: number | null
  payout_currency: string | null
  status: WithdrawalStatus
  reviewed_by: string | null
  reviewed_at: string | null
  sent_tx_hash: string | null
  reject_reason: string | null
  created_at: string
}

export type PayoutAccount = {
  user_id: string
  account_name: string
  bank_name: string
  account_number: string
  bank_code: string | null
  country_code: string | null
  created_at: string
  updated_at: string
  eligible_at: string
}

export type SubscriptionPlan = {
  id: string
  name: string
  description: string | null
  duration_days: number
  price_usdt: number
  features: string[]
  active: boolean
  sort_order: number
}

export type UserSubscription = {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'expired' | 'cancelled'
  started_at: string
  expires_at: string
  paid_with_deposit: string | null
}

const PAGE = 20

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export function useSubscriptionPlans() {
  return useQuery<SubscriptionPlan[]>({
    queryKey: ['subscription_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as SubscriptionPlan[]
    },
  })
}

export function useMySubscription() {
  const session = useAuth((s) => s.session)
  return useQuery<UserSubscription | null>({
    queryKey: ['my_subscription', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', session!.user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as UserSubscription | null) ?? null
    },
  })
}

export function useSubscribe() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase
        .rpc('subscribe', { plan_id: planId })
        .select('*')
        .single()
      if (error) throw error
      return data as UserSubscription
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_subscription'] })
      if (session) qc.invalidateQueries({ queryKey: walletKey(session.user.id) })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

// ============================================================================
// DEPOSITS
// ============================================================================

type CreateDepositVars = {
  amountUsdt: number
  provider: PaymentProvider
  amountLocal?: number | null
  currencyLocal?: string | null
}

export function useCreateDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: CreateDepositVars) => {
      const { data, error } = await supabase
        .rpc('create_deposit', {
          amount_usdt: vars.amountUsdt,
          provider: vars.provider,
          amount_local: vars.amountLocal ?? null,
          currency_local: vars.currencyLocal ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Deposit
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits:mine'] })
    },
  })
}

/**
 * Record + settle an ALATPay payment from the client callback. Only called
 * once ALATPay fires onTransaction (i.e. the user actually initiated/made
 * the payment) — nothing is written before that. Creates the deposit as
 * 'paid' and credits the wallet when `completed`, else 'pending'. Idempotent
 * on the transaction id, so re-firing (or a later webhook) won't double-credit.
 */
export function useRecordAlatpayDeposit() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: {
      transactionId: string
      amountUsd: number          // recorded to the wallet (base currency)
      amountLocal: number        // what the user saw, in their currency
      currencyLocal: string
      completed: boolean
      payload?: unknown
    }) => {
      const { data, error } = await supabase
        .rpc('record_alatpay_deposit', {
          transaction_id: vars.transactionId,
          amount_usd: vars.amountUsd,
          amount_local: vars.amountLocal,
          currency_local: vars.currencyLocal,
          completed: vars.completed,
          payload: (vars.payload ?? null) as object | null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Deposit
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits:mine'] })
      if (session) qc.invalidateQueries({ queryKey: walletKey(session.user.id) })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

export function useMyDeposits() {
  const session = useAuth((s) => s.session)
  return useInfiniteQuery<
    Deposit[],
    Error,
    InfiniteData<Deposit[]>,
    ['deposits:mine', string | null],
    string | null
  >({
    queryKey: ['deposits:mine', session?.user.id ?? null],
    enabled: !!session,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('deposits')
        .select('*')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Deposit[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : last[last.length - 1].created_at,
  })
}

// ============================================================================
// WITHDRAWALS
// ============================================================================

/** Earnings available to withdraw (deposits are NOT withdrawable):
 *  earnings received − already withdrawn + refunds for rejected requests. */
export function useWithdrawable() {
  const session = useAuth((s) => s.session)
  return useQuery<number>({
    queryKey: ['withdrawable', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_withdrawable')
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

export function useRequestWithdrawal() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: { amountUsd: number; amountLocal: number; currencyLocal: string }) => {
      const { data, error } = await supabase
        .rpc('request_withdrawal', {
          amount_usd: vars.amountUsd,
          amount_local: vars.amountLocal,
          currency_local: vars.currencyLocal,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as WithdrawalRequest
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals:mine'] })
      qc.invalidateQueries({ queryKey: ['withdrawable'] })
      if (session) qc.invalidateQueries({ queryKey: walletKey(session.user.id) })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

/** The signed-in user's saved payout (bank) account, or null. */
export function useMyPayoutAccount() {
  const session = useAuth((s) => s.session)
  return useQuery<PayoutAccount | null>({
    queryKey: ['payout-account', session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_accounts')
        .select('*')
        .eq('user_id', session!.user.id)
        .maybeSingle()
      if (error) throw error
      return (data as PayoutAccount | null) ?? null
    },
  })
}

export function useSavePayoutAccount() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)
  return useMutation({
    mutationFn: async (vars: {
      accountName: string
      bankName: string
      accountNumber: string
      bankCode?: string | null
      countryCode?: string | null
    }) => {
      if (!session) throw new Error('not signed in')
      const { data, error } = await supabase
        .from('payout_accounts')
        .upsert({
          user_id: session.user.id,
          account_name: vars.accountName,
          bank_name: vars.bankName,
          account_number: vars.accountNumber,
          bank_code: vars.bankCode ?? null,
          country_code: vars.countryCode ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as PayoutAccount
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payout-account'] })
    },
  })
}

export function useMyWithdrawals() {
  const session = useAuth((s) => s.session)
  return useInfiniteQuery<
    WithdrawalRequest[],
    Error,
    InfiniteData<WithdrawalRequest[]>,
    ['withdrawals:mine', string | null],
    string | null
  >({
    queryKey: ['withdrawals:mine', session?.user.id ?? null],
    enabled: !!session,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WithdrawalRequest[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : last[last.length - 1].created_at,
  })
}
