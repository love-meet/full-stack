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
 *
 * TRUST MODEL (0094/0095, live schema, not revisitable without a migration):
 * `play_chat_move` validates membership, turn order and optimistic
 * concurrency (`move_count`) — nothing else. For the five open-information
 * games (`tic_tac_toe`, `connect_four`, `nim`, `dots_and_boxes`, `draughts`)
 * the rules run entirely on the client and the server stores whatever
 * `state` / `finished` / `winner` it is sent: a modified client can forge a
 * board or declare itself the winner in those five. Only `word_guess`,
 * `rock_paper_scissors` and `number_duel` are server-checked, and only for
 * the hidden part (the word, the throws, the number) via the 0095 secret
 * RPCs in `secretApi.ts` — their scorekeeping is still client-written and
 * just as forgeable. This is accepted: games are free, have no entry cost
 * and no winnings or ranking (§9.1), so there is nothing to cheat for and
 * nothing worth the cost of duplicated server-side rule engines. Do not try
 * to defend against it client-side.
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
  /** One line for the opponent's notification: "dropped a disc". */
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
  /**
   * Submit a move (`play_chat_move`, via `usePlayChatMove`). This is the
   * ONLY way a board hands a move to the server — never call `play_chat_move`
   * directly.
   *
   * Resolves `true` once the server call succeeded. Resolves `false` if it
   * failed; in that case `onError` has already been called with the same
   * error (the board does not also call `onError` itself), and the card
   * (`ChatGameCard`) has already rendered whatever notice belongs on screen
   * — stale-move copy, "Saved — tap again to send", or a generic error.
   * **A board must never render its own error text.** Its only jobs on
   * `false` are: (1) do nothing else this tick — no local state advance, no
   * clearing of secrets, no optimistic UI beyond what was already drawn —
   * and (2) leave its input in a state the user can retry from (see the
   * `secretSaved` note below).
   *
   * ALWAYS `await` this before doing anything that assumes the move landed:
   * - a hidden-information board (`rock_paper_scissors`, `word_guess`,
   *   `number_duel`) must only `clearGameSecrets` after it resolves `true`
   *   — clearing on a failed move destroys the one copy of the secret the
   *   retry would need.
   *
   * Pass `opts.secretSaved: true` when this call follows a server-side
   * secret write that has ALREADY succeeded and cannot be un-sent —
   * `set_game_secret`, or (for `rock_paper_scissors`) `revealRpsThrows` once
   * both throws are in. This is the case on all three server-validated
   * games' first screen: `word_guess` and `number_duel` setting their
   * secret, and both the first and second RPS thrower after their
   * respective secret RPC. The board declares this up front rather than
   * handing an error object back, so the choice of COPY ("Saved — tap again
   * to send" vs. a generic failure) stays a card-only decision (§4, D9) —
   * the board just says whether a point of no return was already crossed.
   * On a `secretSaved` failure the board must NOT re-call `set_game_secret`
   * (it is set-once and would no-op anyway) and must NOT clear or discard
   * whatever local value it froze from the secret — the user's next tap
   * must be able to resend the same move unchanged.
   */
  onMove: (result: MoveResult<S>, opts?: { secretSaved?: boolean }) => Promise<boolean>
  /** A direct RPC call the board made outside `onMove` — a secret RPC
   *  (`setGameSecret`, `guessWordLetter`, `guessDuelNumber`,
   *  `revealRpsThrows`, `clearGameSecrets`) — failed. Boards never render
   *  the error themselves: they report it here and stop (no local state
   *  advance); the central handler (`ChatGameCard`) does stale detection
   *  and renders the notice UI in one place (§4 of the client plan).
   *
   *  `onMove` failures do NOT also go through `onError` — `onMove`'s own
   *  return value (`false`) is the board's only signal for that case; use
   *  `onError` only for the RPC calls that happen outside `onMove`. */
  onError: (e: unknown) => void
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
