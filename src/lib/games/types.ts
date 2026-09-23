import type { ComponentType } from 'react'

/**
 * The shape every chat game implements (§8).
 *
 * Turn-based, asynchronous, played inside a chat. No presence, no spectators,
 * no lobby — a game is a row and two people who each move whenever they get
 * round to it.
 *
 * Rules are pure functions over a JSON state. State refers to players by ROLE
 * ('a' = whoever sent the invite, 'b' = whoever accepted), never by user id,
 * so the rules never need to know who is playing. The server maps roles back
 * to user ids when it decides whose turn it is.
 */

export type Role = 'a' | 'b'

export type ChatGameKind =
  | 'tic_tac_toe'
  | 'connect_four'
  | 'rock_paper_scissors'
  | 'nim'
  | 'word_guess'
  | 'dots_and_boxes'
  | 'draughts'
  | 'number_duel'

/** What a move produces. Everything but `state` has a sensible default. */
export type MoveResult<S> = {
  state: S
  /** Who moves next. Omit to hand the turn over — the common case. Games
   *  where the same player continues (a multi-jump, a matched pair, a run of
   *  guesses) pass their own role back. */
  nextTurn?: Role
  finished?: boolean
  /** Winner's role. `null` with `finished: true` is a draw. */
  winner?: Role | null
  /** One line for the opponent's notification: "Ada played the middle square". */
  summary?: string
}

/** How a finished game went, from this viewer's side. `null` = still running. */
export type Outcome = 'won' | 'lost' | 'draw' | null

export type BoardProps<S> = {
  /** Needed by hidden-information games to call the server-side checks. */
  gameId: string
  state: S
  myRole: Role
  isMyTurn: boolean
  finished: boolean
  outcome: Outcome
  busy: boolean
  onMove: (result: MoveResult<S>) => void
}

export type GameDef<S = unknown> = {
  kind: ChatGameKind
  name: string
  emoji: string
  /** One line in the picker. Has to make the game obvious without a tutorial. */
  blurb: string
  initialState: () => S
  /**
   * Status line under the board — whose turn, what to do, how it ended.
   *
   * Takes `outcome` rather than a bare `finished` flag: the turn is cleared
   * when a game ends, so a finished board can't work out who won from whose
   * turn it would have been.
   */
  status: (state: S, myRole: Role, isMyTurn: boolean, outcome: Outcome) => string
  Board: ComponentType<BoardProps<S>>
}

export const other = (r: Role): Role => (r === 'a' ? 'b' : 'a')
