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
 * Draughts, on the rules engine from the old real-time version.
 *
 * lib/draughts.ts is pure — board, legal moves, apply, loss detection — so it
 * survived Phase 0 untouched and this is just a new surface on it. Role 'a'
 * plays red, 'b' plays black; red moves first.
 */
export type DraughtsState = {
  board: DraughtsBoardT
  turn: PieceColor
}

const COLOR_OF: Record<Role, PieceColor> = { a: 'r', b: 'b' }
const ROLE_OF: Record<PieceColor, Role> = { r: 'a', b: 'b' }

function sameSquare(a: Square, b: Square) {
  return a.r === b.r && a.c === b.c
}

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<DraughtsState>) {
  const myColor = COLOR_OF[myRole]
  const [selected, setSelected] = useState<Square | null>(null)

  const myLegal = useMemo(
    () => (isMyTurn && !finished ? legalMoves(state.board, myColor) : []),
    [state.board, myColor, isMyTurn, finished],
  )

  const fromSquares = useMemo(
    () => new Set(myLegal.map((m) => `${m.from.r},${m.from.c}`)),
    [myLegal],
  )

  const options = useMemo(
    () => (selected ? legalMovesFrom(state.board, selected, myColor) : []),
    [selected, state.board, myColor],
  )

  function play(move: Move) {
    if (!isMyTurn || busy || finished) return
    const board = applyMove(state.board, move)
    const nextColor = other(myRole) === 'a' ? 'r' : 'b'
    // A multi-jump leaves the same colour to move; the engine reports that by
    // still having captures available from the landing square.
    const chain = move.captures?.length
      ? legalMovesFrom(board, move.to, myColor).filter((m) => m.captures?.length)
      : []
    const keepsTurn = chain.length > 0
    const turn: PieceColor = keepsTurn ? myColor : nextColor
    const opponentLost = !keepsTurn && isLost(board, nextColor)

    setSelected(keepsTurn ? move.to : null)
    onMove({
      state: { board, turn },
      nextTurn: keepsTurn ? myRole : other(myRole),
      finished: opponentLost,
      winner: opponentLost ? myRole : null,
      summary: opponentLost ? 'won at draughts' : move.captures?.length ? 'took a piece' : 'moved',
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
                  {target && (
                    <span className="absolute w-3 h-3 rounded-full bg-gold/80" />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {selected && (
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
  blurb: 'Classic 8×8 draughts. Jumps are forced.',
  initialState: () => ({ board: initialBoard(), turn: 'r' }),
  status: (state, myRole, isMyTurn, outcome) => {
    if (outcome === 'draw') return 'A draw.'
    if (outcome) return outcome === 'won' ? 'You win.' : 'They win this one.'
    if (isMyTurn) {
      const mine = legalMoves(state.board, COLOR_OF[myRole])
      const forced = mine.some((m) => m.captures?.length)
      return forced ? 'Your turn — you must take' : 'Your turn'
    }
    return 'Waiting for them'
  },
  Board,
}

export { ROLE_OF }
