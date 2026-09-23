import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import type { ChatGameKind, MoveResult, Role } from '../lib/games/types'

export type ChatGameStatus = 'invited' | 'active' | 'finished' | 'declined'

export type ChatGame = {
  id: string
  conversation_id: string
  kind: ChatGameKind
  status: ChatGameStatus
  player_a: string
  player_b: string
  turn_user_id: string | null
  state: unknown
  move_count: number
  winner_user_id: string | null
  is_draw: boolean
  created_at: string
  updated_at: string
  finished_at: string | null
}

export const chatGamesKey = (conversationId: string | null) =>
  ['chat-games', conversationId] as const

/**
 * Games in this conversation (§8).
 *
 * Only the two players can read the rows at all — RLS sees to that, so there
 * is no spectator path even if someone guesses an id.
 */
export function useChatGames(conversationId: string | null) {
  return useQuery<ChatGame[]>({
    queryKey: chatGamesKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_games')
        .select('*')
        .eq('conversation_id', conversationId!)
        .in('status', ['invited', 'active', 'finished'])
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as ChatGame[]
    },
  })
}

/**
 * Live board updates.
 *
 * This is the whole of "asynchronous" — no presence channel, no heartbeat,
 * nobody has to be online. A move lands, the row changes, the other board
 * redraws whenever its owner happens to be looking.
 */
export function useChatGamesRealtime(conversationId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`chat-games:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_games',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }) },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [conversationId, qc])
}

export function useCreateChatGame(conversationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { kind: ChatGameKind; state: unknown }): Promise<ChatGame> => {
      const { data, error } = await supabase.rpc('create_chat_game', {
        p_conversation: conversationId,
        p_kind: vars.kind,
        p_state: vars.state as object,
      })
      if (error) throw error
      return data as ChatGame
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }),
  })
}

export function useRespondChatGame(conversationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { gameId: string; accept: boolean }): Promise<ChatGame> => {
      const { data, error } = await supabase.rpc('respond_chat_game', {
        p_game: vars.gameId,
        p_accept: vars.accept,
      })
      if (error) throw error
      return data as ChatGame
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }),
  })
}

/** Thrown when the board moved on under us — refetch and redraw, don't retry. */
export function isStaleMove(e: unknown): boolean {
  return e instanceof Error && e.message.includes('stale_move')
}

export function usePlayChatMove(conversationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      gameId: string
      expectedMove: number
      result: MoveResult<unknown>
    }): Promise<ChatGame> => {
      const { result } = vars
      const { data, error } = await supabase.rpc('play_chat_move', {
        p_game: vars.gameId,
        p_state: result.state as object,
        p_expected_move: vars.expectedMove,
        p_next_turn: result.nextTurn ?? null,
        p_finished: !!result.finished,
        p_winner: result.winner ?? null,
        p_summary: result.summary ?? null,
      })
      if (error) throw error
      return data as ChatGame
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }),
    onError: () => qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }),
  })
}

export function useResignChatGame(conversationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gameId: string): Promise<ChatGame> => {
      const { data, error } = await supabase.rpc('resign_chat_game', { p_game: gameId })
      if (error) throw error
      return data as ChatGame
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatGamesKey(conversationId) }),
  })
}

/** Which side of the board this viewer is on. */
export function useMyRole(game: ChatGame): Role | null {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  if (!myId) return null
  if (game.player_a === myId) return 'a'
  if (game.player_b === myId) return 'b'
  return null
}
