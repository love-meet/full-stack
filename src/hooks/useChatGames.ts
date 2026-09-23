import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
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
 *
 * One subscriber per conversation, please: `supabase.channel(topic)` returns
 * the SAME channel object when the topic is already open, so a second mount
 * on `chat-games:<id>` shares — and a second unmount tears down — the first
 * one's subscription rather than opening its own. This is exactly how D6 bit
 * the ads path, so it's enforced here with a refcount rather than left as a
 * comment: the channel opens on the first mount for a given conversation and
 * closes only when the last one unmounts.
 *
 * That refcount alone isn't enough, though (B-3). In `@supabase/phoenix`,
 * `channel.leave()` (which `removeChannel` triggers) marks the channel
 * `leaving` synchronously but only actually detaches it from the client
 * (`RealtimeClient._remove`) once the server's leave reply arrives. If refs
 * drop to 0 and a new mount for the same topic lands before that reply
 * (same-commit remount, or A -> B -> A within one round trip),
 * `supabase.channel(topic)` would hand back the still-`leaving` channel: a
 * second `.on()` double-binds onto it, `.subscribe()` no-ops because it
 * isn't closed yet, and the pending teardown then kills it anyway — leaving
 * the map holding a dead channel with `refs: 1` and no live updates until a
 * full leave-and-return. (StrictMode's cold double-mount does NOT hit this —
 * that channel is still `joining`, so `leave()` closes it synchronously — so
 * this will not surface in dev; that is not evidence it's fine.)
 *
 * Fixed by keeping a `removing` promise on the entry: a ref that arrives
 * while a leave is in flight just bumps `refs` and waits — it does not touch
 * `supabase.channel(topic)` — and once the leave is acked, a single fresh
 * channel is opened (only if refs are still > 0) and swapped into the entry.
 */
type ChatGamesChannelEntry = {
  channel: RealtimeChannel
  refs: number
  /** Non-null while this topic's previous channel is being left. Cleared
   *  once the server acks the leave (see the block comment above). */
  removing: Promise<void> | null
}
const chatGameChannels = new Map<string, ChatGamesChannelEntry>()

function openChatGamesChannel(
  topic: string,
  conversationId: string,
  qc: ReturnType<typeof useQueryClient>,
): RealtimeChannel {
  return supabase
    .channel(topic)
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
}

/** Leaves `entry.channel`; once acked, either opens a fresh channel for refs
 *  that arrived while it was leaving, or drops the topic if none did. */
function scheduleChatGamesRemoval(
  topic: string,
  entry: ChatGamesChannelEntry,
  conversationId: string,
  qc: ReturnType<typeof useQueryClient>,
): void {
  entry.removing = supabase.removeChannel(entry.channel).then(() => {
    entry.removing = null
    if (chatGameChannels.get(topic) !== entry) return
    if (entry.refs > 0) {
      entry.channel = openChatGamesChannel(topic, conversationId, qc)
    } else {
      chatGameChannels.delete(topic)
    }
  })
}

export function useChatGamesRealtime(conversationId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!conversationId) return
    const topic = `chat-games:${conversationId}`
    let entry = chatGameChannels.get(topic)
    if (!entry) {
      entry = { channel: openChatGamesChannel(topic, conversationId, qc), refs: 0, removing: null }
      chatGameChannels.set(topic, entry)
    }
    // If `entry.removing` is set, a previous leave for this topic hasn't been
    // acked yet: just reserve this mount's ref. `scheduleChatGamesRemoval`'s
    // continuation opens the replacement channel once the leave resolves —
    // never call `supabase.channel(topic)` again while it's still leaving.
    entry.refs += 1
    return () => {
      const e = chatGameChannels.get(topic)
      if (!e) return
      e.refs -= 1
      if (e.refs > 0) return
      if (e.removing) return // teardown already scheduled; its continuation checks refs
      scheduleChatGamesRemoval(topic, e, conversationId, qc)
    }
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
 * postgrest-js does NOT throw `Error` instances for RPC failures — by default
 * `processResponse` just `JSON.parse`s the response body into a plain object
 * (`{ message, code, details, hint }`) and hands it back as `error`; every
 * call site here does `if (error) throw error`, so what lands in a `catch`
 * is that plain object, not an `Error`. `e instanceof Error` is therefore
 * always false for a real `stale_move` / `not your turn` rejection — duck
 * type the message instead. (Matches the pattern already used for RPC
 * errors in `useCredits.ts`'s `spendDailyMessageCredit`.)
 */
const errMessage = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'message' in e
    ? String((e as { message: unknown }).message)
    : ''

/** Thrown when the board moved on under us — refetch and redraw, don't retry. */
export function isStaleMove(e: unknown): boolean {
  return errMessage(e).includes('stale_move')
}

/**
 * Broader than `isStaleMove`: catches every shape of "the row is not what
 * this action assumed it was" that the live RPCs raise —
 * - `play_chat_move`: `stale_move` (`move_count` moved under us)
 * - any move/guess RPC: `not your turn` (the turn changed under us)
 * - any move/guess RPC: `game is not active` (finished/declined under us)
 * - `word_guess`'s guess RPC: `already guessed` — the word-guess form of the
 *   same "the board moved under you" condition (someone already guessed the
 *   letter/word this state has), so it gets the same refetch-and-redraw
 *   treatment rather than a hard error.
 *
 * Stale moves are normal, not exceptional: in an async turn-based game the
 * opponent moving first is routine, not an error state. Every one of these
 * is recoverable the same way — refetch, let the board redraw from the
 * server row, never treat it as a dead end or a lost move (§4 of the client
 * plan). `respond_chat_game` returning a row unchanged (already answered) is
 * NOT an error and is not covered here; it's handled by the normal refetch.
 */
export function isStaleLike(e: unknown): boolean {
  const msg = errMessage(e)
  return (
    msg.includes('stale_move') ||
    msg.includes('not your turn') ||
    msg.includes('game is not active') ||
    msg.includes('already guessed')
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
