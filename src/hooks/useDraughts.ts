import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Board, Square } from '../lib/draughts'

export type DraughtsRound = {
  game_id: string
  round_no: number
  board: Board
  turn_user_id: string | null
  status: 'playing' | 'done'
  winner_player: string | null
  started_at: string | null
  decided_at: string | null
}

const roundKey = (g?: string, r?: number) => ['draughts-round', g ?? null, r ?? null] as const

/** Subscribe to the active board for this game. Updates live as moves come in. */
export function useDraughtsRound(gameId: string | undefined, round: number | undefined) {
  const qc = useQueryClient()
  const enabled = !!gameId && !!round && round > 0
  const q = useQuery<DraughtsRound | null>({
    queryKey: roundKey(gameId, round),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('draughts_rounds')
        .select('*')
        .eq('game_id', gameId!)
        .eq('round_no', round!)
        .maybeSingle()
      if (error) throw error
      return (data as DraughtsRound | null) ?? null
    },
  })

  useEffect(() => {
    if (!gameId) return
    const ch = supabase.channel(`draughts-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draughts_rounds', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['draughts-round', gameId] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [gameId, qc])

  return q
}

export function useSubmitDraughtsMove() {
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      gameId: string; round: number
      from: Square; to: Square; captures: Square[]
    }) => {
      const { error } = await supabase.rpc('submit_draughts_move', {
        p_game_id: v.gameId,
        p_round: v.round,
        p_from_r: v.from.r, p_from_c: v.from.c,
        p_to_r:   v.to.r,   p_to_c:   v.to.c,
        p_captures: v.captures,
      })
      if (error) throw error
    },
  })
}

export function useConcedeDraughtsRound() {
  return useMutation({
    retry: false,
    mutationFn: async (v: { gameId: string; round: number }) => {
      const { error } = await supabase.rpc('concede_draughts_round', {
        p_game_id: v.gameId, p_round: v.round,
      })
      if (error) throw error
    },
  })
}
