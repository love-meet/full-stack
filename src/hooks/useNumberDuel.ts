import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type DuelRound = {
  game_id: string
  round_no: number
  status: 'picking' | 'guessing' | 'done'
  winner_player: string | null
  started_at: string | null
  decided_at: string | null
}
export type DuelSecret = { user_id: string; secret: number }
export type DuelGuess = {
  id: string
  guesser_id: string
  value: number
  feedback: 'higher' | 'lower' | 'correct'
  created_at: string
}

const roundKey = (g?: string, r?: number) => ['duel-round', g ?? null, r ?? null] as const
const secretsKey = (g?: string, r?: number) => ['duel-secrets', g ?? null, r ?? null] as const
const guessesKey = (g?: string, r?: number) => ['duel-guesses', g ?? null, r ?? null] as const

/** Live duel state for the current round (round meta, both secrets per RLS,
 *  and all guesses). A single channel invalidates the three queries. */
export function useDuelState(gameId: string | undefined, round: number | undefined) {
  const qc = useQueryClient()
  const enabled = !!gameId && !!round && round > 0

  const roundQ = useQuery<DuelRound | null>({
    queryKey: roundKey(gameId, round),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('duel_rounds')
        .select('*').eq('game_id', gameId!).eq('round_no', round!).maybeSingle()
      if (error) throw error
      return (data as DuelRound | null) ?? null
    },
  })
  const secretsQ = useQuery<DuelSecret[]>({
    queryKey: secretsKey(gameId, round),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('duel_secrets')
        .select('user_id, secret').eq('game_id', gameId!).eq('round_no', round!)
      if (error) throw error
      return (data ?? []) as DuelSecret[]
    },
  })
  const guessesQ = useQuery<DuelGuess[]>({
    queryKey: guessesKey(gameId, round),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('duel_guesses')
        .select('id, guesser_id, value, feedback, created_at')
        .eq('game_id', gameId!).eq('round_no', round!).order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DuelGuess[]
    },
  })

  useEffect(() => {
    if (!gameId) return
    const ch = supabase.channel(`duel-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duel_rounds', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['duel-round', gameId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duel_secrets', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['duel-secrets', gameId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duel_guesses', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['duel-guesses', gameId] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [gameId, qc])

  return {
    round: roundQ.data ?? null,
    secrets: secretsQ.data ?? [],
    guesses: guessesQ.data ?? [],
    isPending: roundQ.isPending,
  }
}

export function useSetDuelSecret() {
  return useMutation({
    retry: false,
    mutationFn: async (vars: { gameId: string; round: number; secret: number }) => {
      const { error } = await supabase.rpc('set_duel_secret', { p_game_id: vars.gameId, p_round: vars.round, p_secret: vars.secret })
      if (error) throw error
    },
  })
}

export function useSubmitDuelGuess() {
  return useMutation({
    retry: false,
    mutationFn: async (vars: { gameId: string; round: number; value: number }) => {
      const { data, error } = await supabase.rpc('submit_duel_guess', { p_game_id: vars.gameId, p_round: vars.round, p_value: vars.value })
      if (error) throw error
      return data as 'higher' | 'lower' | 'correct' | 'closed'
    },
  })
}

export function useAdvanceDuel() {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (vars: { gameId: string; round: number }) => {
      const { error } = await supabase.rpc('advance_duel', { p_game_id: vars.gameId, p_round: vars.round })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game'] })
      qc.invalidateQueries({ queryKey: ['game-players'] })
    },
  })
}
