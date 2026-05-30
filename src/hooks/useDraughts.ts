import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { applyMove, type Board, type Square } from '../lib/draughts'

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

/** Submit a move, optimistically applying it locally first so the piece
 *  jumps to its destination immediately. Realtime then syncs the canonical
 *  state from the server; if the server rejects the move we roll back. */
export function useSubmitDraughtsMove() {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (v: {
      gameId: string; round: number
      from: Square; to: Square; captures: Square[]
      /** The OTHER player's user id — we flip turn_user_id locally so the
       *  player can't accidentally play another move while the server
       *  confirms. */
      opponentId: string | null
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
    onMutate: async (v) => {
      const key = roundKey(v.gameId, v.round)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<DraughtsRound | null>(key)
      if (prev) {
        const nextBoard = applyMove(prev.board, {
          from: v.from, to: v.to, captures: v.captures,
        })
        qc.setQueryData<DraughtsRound | null>(key, {
          ...prev, board: nextBoard, turn_user_id: v.opponentId,
        })
      }
      return { prev }
    },
    onError: (_e, v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(roundKey(v.gameId, v.round), ctx.prev)
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

/** Advance to the next draughts round (or finish the match) after a board
 *  is won — server serialises the call and only fires when the round is
 *  actually `done`, so it's safe to call from every connected client. */
export function useAdvanceDraughts() {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (v: { gameId: string; round: number }) => {
      const { error } = await supabase.rpc('advance_draughts', {
        p_game_id: v.gameId, p_round: v.round,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game'] })
      qc.invalidateQueries({ queryKey: ['game-players'] })
    },
  })
}
