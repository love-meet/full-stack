/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import { useMemo, useState } from 'react'
import type { BoardProps, GameDef, Role } from './types'
import { other } from './types'
import {
  BOARD_SIZE,
  initialBoard,
  legalMoves,
  legalMovesFrom,
  applyMove,
  isLost,
  type Board as DraughtsBoardT,
  type Move,
  type PieceColor,
  type Square,
} from '../draughts'

/**
 * Draughts, on the rules engine carried over from the old real-time version
 * (`src/lib/draughts.ts`, untouched — pure, framework-free, already exercised
 * by a shipped game). Role 'a' plays red ('r'), 'b' plays black ('b'); red
 * moves first.
 *
 * RULES IMPLEMENTED HERE, STATED PLAINLY:
 * - Captures are FORCED: if any of your pieces can capture, only capturing
 *   moves are offered (`legalMoves` drops every plain step the moment one
 *   capture exists anywhere on the board for that side).
 * - A capture chain is forced to CONTINUE, but not to be MAXIMAL: once a
 *   jump is taken, the same piece must keep jumping while it still can
 *   (`chainFrom`, below), but if a player has more than one initial capture
 *   to choose from — e.g. two different pieces can each start a chain, one
 *   shorter than the other — either is legal. Only that one piece may move,
 *   and only its own further captures, until its chain ends.
 * - Kings FLY: a king moves or captures any distance along an open diagonal
 *   (`kingCapturesFrom`/plain king steps in the engine), not just one square.
 * - Promotion looks only at where a move ENDS — `applyMove` (draughts.ts:201-219)
 *   checks only `move.to` against the far back rank, for a plain step exactly
 *   as much as for a capture. A chain still in progress is walked with pawn
 *   geometry the whole way (`pawnCapturesFrom`), so crossing the back rank
 *   partway through a chain does not promote. If a chain does land on the
 *   back rank and the newly-made king can still capture from there, that next
 *   hop is offered using the king's (flying) capture rules — promotion does
 *   not by itself end the turn.
 * - NO draw rule: two kings can shuffle forever with nothing in this engine
 *   to call it. Resign is the only way out of a dead position (S-3 in the
 *   plan); `outcome === 'draw'` is unreachable for this game but the branch
 *   is kept for type-shape parity with the other boards.
 *
 * MULTI-JUMP ACROSS TURNS (D11): `DraughtsState.chainFrom` records the
 * square a forced continuation must move from. `ChatGameCard` remounts the
 * Board on every accepted move (keyed on `move_count`), which would
 * otherwise drop any local "mid-chain" selection; carrying it in server
 * state instead means both devices, a reload, or a stale refetch all agree
 * on which piece is mid-chain.
 */
export type DraughtsState = {
  board: DraughtsBoardT
  /** Mirrors whichever colour is next to move; for rendering/status only —
   *  the server's `turn_user_id` (via `nextTurn`) is what actually gates play. */
  turn: PieceColor
  /** Set when the mover must continue a capture chain from this square.
   *  Cleared (null) whenever the turn changes hands. */
  chainFrom: Square | null
}

const COLOR_OF: Record<Role, PieceColor> = { a: 'r', b: 'b' }
const OPPONENT_COLOR: Record<PieceColor, PieceColor> = { r: 'b', b: 'r' }

function sameSquare(a: Square, b: Square) {
  return a.r === b.r && a.c === b.c
}

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<DraughtsState>) {
  const myColor = COLOR_OF[myRole]
  const forced = isMyTurn && !finished ? state.chainFrom : null
  const [selected, setSelected] = useState<Square | null>(forced)

  const myLegal = useMemo(
    () => (isMyTurn && !finished ? legalMoves(state.board, myColor) : []),
    [state.board, myColor, isMyTurn, finished],
  )

  // While mid-chain, only the forced piece may be picked up.
  const fromSquares = useMemo(() => {
    if (forced) return new Set([`${forced.r},${forced.c}`])
    return new Set(myLegal.map((m) => `${m.from.r},${m.from.c}`))
  }, [myLegal, forced])

  const options = useMemo(
    () => (selected ? legalMovesFrom(state.board, selected, myColor) : []),
    [selected, state.board, myColor],
  )

  async function play(move: Move) {
    if (!isMyTurn || busy || finished) return
    const board = applyMove(state.board, move)
    const captureCount = move.captures.length
    // A multi-jump leaves the same colour to move; the engine reports that
    // by still having captures available from the landing square (whether
    // the piece is still a pawn or was just promoted to a king).
    const chain = captureCount > 0 ? legalMovesFrom(board, move.to, myColor).filter((m) => m.captures.length > 0) : []
    const continues = chain.length > 0
    const nextColor = OPPONENT_COLOR[myColor]
    const opponentLost = !continues && isLost(board, nextColor)
    const pieceWord = captureCount === 1 ? 'a piece' : `${captureCount} pieces`

    await onMove({
      state: { board, turn: continues ? myColor : nextColor, chainFrom: continues ? move.to : null },
      nextTurn: continues ? myRole : other(myRole),
      finished: opponentLost,
      winner: opponentLost ? myRole : null,
      summary: opponentLost ? 'won at draughts' : captureCount > 0 ? `took ${pieceWord}` : 'moved',
    })
  }

  // Your pieces always sit at the bottom of your own screen.
  const flip = myColor === 'r'
  const rows = Array.from({ length: BOARD_SIZE }, (_, i) => (flip ? BOARD_SIZE - 1 - i : i))
  const cols = Array.from({ length: BOARD_SIZE }, (_, i) => (flip ? BOARD_SIZE - 1 - i : i))

  return (
    <div className="w-full max-w-[19rem] mx-auto">
      <div className="rounded-xl overflow-hidden ring-2 ring-white/10">
        {rows.map((r) => (
          <div key={r} className="flex">
            {cols.map((c) => {
              const dark = (r + c) % 2 === 1
              const piece = state.board.find((p) => p.r === r && p.c === c)
              const isSelected = selected && sameSquare(selected, { r, c })
              const target = options.find((m) => sameSquare(m.to, { r, c }))
              const selectable = fromSquares.has(`${r},${c}`)

              return (
                <button
                  key={c}
                  disabled={!isMyTurn || busy || finished || (!selectable && !target)}
                  onClick={() => {
                    if (target) { play(target); return }
                    if (selectable) setSelected({ r, c })
                  }}
                  aria-label={`Square ${r + 1}, ${c + 1}`}
                  className={[
                    'relative aspect-square flex-1 grid place-items-center transition-colors',
                    dark ? 'bg-[#6b4423]' : 'bg-[#d8b98c]',
                    isSelected ? 'ring-2 ring-inset ring-gold' : '',
                  ].join(' ')}
                >
                  {piece && (
                    <span
                      className={[
                        'w-[72%] aspect-square rounded-full grid place-items-center text-[10px] font-black',
                        piece.color === 'r'
                          ? 'bg-gradient-to-b from-rose to-coral text-white'
                          : 'bg-gradient-to-b from-neutral-700 to-black text-white/80',
                        selectable ? 'ring-2 ring-gold/70' : '',
                      ].join(' ')}
                    >
                      {piece.king ? '♔' : ''}
                    </span>
                  )}
                  {target && <span className="absolute w-3 h-3 rounded-full bg-gold/80" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {/* No deselect while a chain is forced — the piece must finish jumping. */}
      {selected && !forced && (
        <button
          onClick={() => setSelected(null)}
          className="mt-2 w-full text-xs text-ink-muted hover:text-ink"
        >
          Deselect
        </button>
      )}
    </div>
  )
}

export const draughts: GameDef<DraughtsState> = {
  kind: 'draughts',
  name: 'Draughts',
  emoji: '⚫',
  blurb: 'Classic 8x8 draughts. Jumps are forced, kings fly.',
  initialState: () => ({ board: initialBoard(), turn: 'r', chainFrom: null }),
  status: (state, myRole, isMyTurn, outcome) => {
    if (outcome === 'draw') return 'A draw.'
    if (outcome) return outcome === 'won' ? 'You win.' : 'They win this one.'
    if (isMyTurn) {
      if (state.chainFrom) return 'Your turn — keep taking'
      const mine = legalMoves(state.board, COLOR_OF[myRole])
      const forced = mine.some((m) => m.captures.length > 0)
      return forced ? 'Your turn — you must take' : 'Your turn'
    }
    return 'Waiting for them'
  },
  Board,
}
