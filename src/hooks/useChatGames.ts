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

/**
 * postgrest-js parses an RPC failure body with `JSON.parse` and throws the
 * resulting plain `{message, code, details, hint}` object as-is
 * (`@supabase/postgrest-js/dist/index.cjs` `processResponse`) — it only
 * constructs a real `PostgrestError` (which extends `Error`) when
 * `throwOnError` is set, which this app never does. So `e instanceof Error`
 * is always false for a mutation's `if (error) throw error`, and any check
 * built on it silently never matches. Duck-type the message instead.
 */
export const errMessage = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'message' in e &&
  typeof (e as { message: unknown }).message === 'string'
    ? (e as { message: string }).message
    : 'Something went wrong.'

/** Thrown when the board moved on under us — refetch and redraw, don't retry. */
export function isStaleMove(e: unknown): boolean {
  return errMessage(e).includes('stale_move')
}

/**
 * Every "the row is not what this action assumed" error the live RPCs raise:
 * `play_chat_move` -> `stale_move` (0094:240); any move/guess RPC ->
 * `not your turn` (0094:238, 0095:91, 0095:152) or `game is not active`
 * (0094:237, 0095:90, 0095:151); `guess_word_letter` -> `already guessed`
 * (0095:106 — only `play_chat_move` writes `state->'guessed'`, so this can
 * only fire when the client's row is behind). All recover the same way:
 * refetch, redraw — never retry the same call.
 */
export function isStaleLike(e: unknown): boolean {
  const m = errMessage(e)
  return (
    m.includes('stale_move') ||
    m.includes('not your turn') ||
    m.includes('game is not active') ||
    m.includes('already guessed')
  )
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
