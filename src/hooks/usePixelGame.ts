import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type GameKind = '1v1' | 'group'
export type GameStatus = 'lobby' | 'active' | 'finished'

export type Game = {
  id: string
  host_id: string
  kind: GameKind
  max_players: number
  status: GameStatus
  invite_code: string
  current_round: number
  rounds_total: number
  winner_team: string | null
  winner_player: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export type GamePlayer = {
  id: string
  game_id: string
  user_id: string
  guest_name: string | null
  team: string | null
  is_host: boolean
  score: number
  trophies: number
  wants_rematch: boolean
  joined_at: string
  profile: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}

/** Human label for a player — their chosen guest name, else handle. */
export function playerLabel(p: GamePlayer): string {
  return p.guest_name || p.profile?.handle || p.profile?.display_name || 'Player'
}

export type GameRound = {
  game_id: string
  round_no: number
  turn_user_id: string | null
  image_url: string | null
  status: 'awaiting_image' | 'racing' | 'done'
  started_at: string | null
  winner_player: string | null
  winner_team: string | null
  winner_time_ms: number | null
}

export const gameByCodeKey = (code: string | undefined) => ['game', 'code', code ?? null] as const
export const gamePlayersKey = (gameId: string | undefined) => ['game-players', gameId ?? null] as const
export const gameRoundKey = (gameId: string | undefined, round: number | undefined) =>
  ['game-round', gameId ?? null, round ?? null] as const

export type LivePlayer = {
  user_id: string
  team: string | null
  joined_at: string
  profile: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}
export type LiveGame = {
  id: string
  invite_code: string
  kind: GameKind
  current_round: number
  rounds_total: number
  players: LivePlayer[]
}

/** Currently-active games, newest first — surfaced in the feed for spectating. */
export function useLiveGames() {
  return useQuery<LiveGame[]>({
    queryKey: ['live-games'],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id, invite_code, kind, current_round, rounds_total, players:game_players(user_id, team, joined_at, profile:user_id(handle, display_name, avatar_url))')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return (data ?? []) as unknown as LiveGame[]
    },
  })
}

export function useGameByCode(code: string | undefined) {
  return useQuery<Game | null>({
    queryKey: gameByCodeKey(code),
    enabled: !!code,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('invite_code', (code ?? '').toUpperCase())
        .maybeSingle()
      if (error) throw error
      return (data as Game | null) ?? null
    },
  })
}

export function useGamePlayers(gameId: string | undefined) {
  const qc = useQueryClient()
  const q = useQuery<GamePlayer[]>({
    queryKey: gamePlayersKey(gameId),
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_players')
        .select('*, profile:user_id(handle, display_name, avatar_url)')
        .eq('game_id', gameId!)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as GamePlayer[]
    },
  })

  // Live updates: players joining + game status changes.
  useEffect(() => {
    if (!gameId) return
    const ch = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: gamePlayersKey(gameId) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['game'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds', filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ['game-round', gameId] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [gameId, qc])

  return q
}

export function useCreateGame() {
  return useMutation({
    mutationFn: async (vars: { kind: GameKind; maxPlayers?: number }) => {
      const { data, error } = await supabase
        .rpc('create_game', { p_kind: vars.kind, p_max: vars.maxPlayers ?? 2 })
        .select()
        .single()
      if (error) throw error
      return data as Game
    },
  })
}

export function useJoinGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { code: string; guestName?: string | null }) => {
      const { data, error } = await supabase
        .rpc('join_game', { p_code: vars.code, p_guest_name: vars.guestName ?? null })
        .select()
        .single()
      if (error) throw error
      return data as Game
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: gameByCodeKey(vars.code) })
      qc.invalidateQueries({ queryKey: ['game-players'] })
    },
  })
}

export function useStartGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { data, error } = await supabase.rpc('start_game', { p_game_id: gameId }).select().single()
      if (error) throw error
      return data as Game
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['game'] }),
  })
}

export function useGameRound(gameId: string | undefined, round: number | undefined) {
  return useQuery<GameRound | null>({
    queryKey: gameRoundKey(gameId, round),
    enabled: !!gameId && !!round && round > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('game_id', gameId!)
        .eq('round_no', round!)
        .maybeSingle()
      if (error) throw error
      return (data as GameRound | null) ?? null
    },
  })
}

export function useSetRoundImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { gameId: string; round: number; imageUrl: string }) => {
      const { data, error } = await supabase
        .rpc('set_round_image', { p_game_id: vars.gameId, p_round: vars.round, p_image: vars.imageUrl })
        .select().single()
      if (error) throw error
      return data as GameRound
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: gameRoundKey(v.gameId, v.round) }),
  })
}

/** A flaky webview connection (Telegram/WebKit "Load failed") can drop the
 *  solve request, which would otherwise cost you the round even though you
 *  finished first. submit_solve is idempotent — once decided it just returns
 *  the round, and the row lock serializes concurrent solves — so we can safely
 *  retry on transient network failures until it lands. */
export function isNetworkError(e: unknown): boolean {
  // PostgREST errors carry a `code`; genuine app errors must NOT be retried.
  if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code) return false
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /load failed|failed to fetch|network|timeout|connection|fetch/.test(msg)
}

/** Resolve after `ms`, OR as soon as the browser reports it's back online —
 *  so a queued request fires the instant connectivity returns. */
function waitOnlineOr(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(t)
      window.removeEventListener('online', finish)
      resolve()
    }
    const t = setTimeout(finish, ms)
    window.addEventListener('online', finish)
  })
}

export function useSubmitSolve() {
  return useMutation({
    // Keep the result pending instead of failing while offline. submit_solve
    // decides by fastest time and lets a faster solve override a network-delayed
    // one, so as long as our request eventually lands while the round is still
    // current it wins on merit. We retry for a long window (~3 min) with backoff,
    // waking immediately when the connection returns — so a player on a bad
    // network keeps playing and their result syncs the moment they're back,
    // rather than hanging on an error.
    retry: false,
    mutationFn: async (vars: { gameId: string; round: number; timeMs: number }) => {
      const start = Date.now()
      let attempt = 0
      let lastErr: unknown
      while (Date.now() - start < 180_000) {
        const { data, error } = await supabase
          .rpc('submit_solve', { p_game_id: vars.gameId, p_round: vars.round, p_time_ms: vars.timeMs })
          .select().single()
        if (!error) return data as GameRound
        lastErr = error
        if (!isNetworkError(error)) throw error
        attempt++
        await waitOnlineOr(Math.min(800 * attempt, 3000))
      }
      throw lastErr
    },
  })
}

export function useCloseGame() {
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { error } = await supabase.rpc('close_game', { p_game_id: gameId })
      if (error) throw error
    },
  })
}

export function useLeaveGame() {
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { error } = await supabase.rpc('leave_game', { p_game_id: gameId })
      if (error) throw error
    },
  })
}

export function useReassignTurn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { gameId: string; round: number }) => {
      const { data, error } = await supabase
        .rpc('reassign_turn', { p_game_id: vars.gameId, p_round: vars.round })
        .select().single()
      if (error) throw error
      return data as GameRound
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: gameRoundKey(v.gameId, v.round) }),
  })
}

/** Vote to rematch the same game (no new link). Resets the match once everyone
 *  has voted; keeps players + the trophy tally. */
export function useRequestRematch() {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (gameId: string) => {
      const { data, error } = await supabase.rpc('request_rematch', { p_game_id: gameId }).select().single()
      if (error) throw error
      return data as Game
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game'] })
      qc.invalidateQueries({ queryKey: ['game-players'] })
    },
  })
}

/** Auto-advance once a round is decided — callable by any participant, safe to
 *  call from several clients at once (the DB serializes + no-ops the losers). */
export function useAutoAdvanceRound() {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (vars: { gameId: string; round: number }) => {
      const { error } = await supabase.rpc('auto_advance_round', { p_game_id: vars.gameId, p_round: vars.round })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game'] })
      qc.invalidateQueries({ queryKey: ['game-round'] })
    },
  })
}

export function useAdvanceRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { data, error } = await supabase.rpc('advance_round', { p_game_id: gameId }).select().single()
      if (error) throw error
      return data as Game
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game'] })
      qc.invalidateQueries({ queryKey: ['game-round'] })
    },
  })
}
