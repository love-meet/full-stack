import { supabase } from '../supabase'

/**
 * Server-side checks for the hidden-information games (migration 0095).
 *
 * The secret never reaches the opponent's client. These calls are the only
 * way to learn anything about it, and each returns the minimum the asker is
 * entitled to.
 */

/** Store my secret for this game. Set once — the server ignores re-sets. */
export async function setGameSecret(gameId: string, secret: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('set_game_secret', { p_game: gameId, p_secret: secret })
  if (error) throw error
}

export type LetterResult = {
  hit: boolean
  positions: number[]
  solved: boolean
  /** Only non-null once solved. */
  word: string | null
}

export async function guessWordLetter(gameId: string, letter: string): Promise<LetterResult> {
  const { data, error } = await supabase.rpc('guess_word_letter', { p_game: gameId, p_letter: letter })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as LetterResult | null
  return {
    hit: !!row?.hit,
    positions: row?.positions ?? [],
    solved: !!row?.solved,
    word: row?.word ?? null,
  }
}

export type DuelResult = {
  /** -1 their number is higher, 1 lower, 0 spot on. */
  verdict: -1 | 0 | 1
  correct: boolean
}

export async function guessDuelNumber(gameId: string, value: number): Promise<DuelResult> {
  const { data, error } = await supabase.rpc('guess_duel_number', { p_game: gameId, p_value: value })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { verdict: number; correct: boolean } | null
  return { verdict: (row?.verdict ?? 0) as -1 | 0 | 1, correct: !!row?.correct }
}

/** Refuses until both throws are in, so the first thrower can't peek. */
export async function revealRpsThrows(gameId: string): Promise<{ mine: string; theirs: string }> {
  const { data, error } = await supabase.rpc('reveal_rps_throws', { p_game: gameId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { mine: string; theirs: string } | null
  if (!row) throw new Error('both players must throw first')
  return row
}

export async function clearGameSecrets(gameId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_game_secrets', { p_game: gameId })
  if (error) throw error
}
