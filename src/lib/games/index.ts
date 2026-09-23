import type { ChatGameKind, GameDef } from './types'
import { ticTacToe } from './ticTacToe'
import { connectFour } from './connectFour'
import { rps } from './rps'
import { nim } from './nim'
import { wordGuess } from './wordGuess'
import { dotsAndBoxes } from './dotsAndBoxes'
import { draughts } from './draughtsGame'
import { numberDuel } from './numberDuel'

/**
 * The eight games (§8), one registry.
 *
 * Order is the order they appear in the picker (plan §3.0): quickest and
 * most obvious first, so the common case is one tap away.
 */
export const GAMES: GameDef<never>[] = [
  ticTacToe,
  rps,
  connectFour,
  nim,
  wordGuess,
  numberDuel,
  dotsAndBoxes,
  draughts,
] as unknown as GameDef<never>[]

const BY_KIND = new Map<ChatGameKind, GameDef<never>>(GAMES.map((g) => [g.kind, g]))

export function gameFor(kind: ChatGameKind): GameDef<never> | undefined {
  return BY_KIND.get(kind)
}

export * from './types'
