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
  joined_at: string
  profile: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}

/** Human label for a player — their chosen guest name, else handle. */
export function playerLabel(p: GamePlayer): string {
  return p.guest_name || p.profile?.handle || p.profile?.display_name || 'Player'
}

export const gameByCodeKey = (code: string | undefined) => ['game', 'code', code ?? null] as const
export const gamePlayersKey = (gameId: string | undefined) => ['game-players', gameId ?? null] as const

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
