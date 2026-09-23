/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import type { BoardProps, GameDef, Role } from './types'

export type TicTacToeState = { cells: (Role | null)[] }

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function winnerOf(cells: (Role | null)[]): Role | null {
  for (const [a, b, c] of LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a]
  }
  return null
}

const MARK: Record<Role, string> = { a: '✕', b: '◯' }

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<TicTacToeState>) {
  function play(i: number) {
    if (!isMyTurn || busy || finished || state.cells[i]) return
    const cells = state.cells.slice()
    cells[i] = myRole
    const win = winnerOf(cells)
    const full = cells.every(Boolean)
    onMove({
      state: { cells },
      finished: !!win || full,
      winner: win ?? null,
      summary: win ? 'won at noughts and crosses' : full ? 'drew at noughts and crosses' : 'played a square',
    })
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 w-full max-w-[15rem] mx-auto">
      {state.cells.map((cell, i) => (
        <button
          key={i}
          onClick={() => play(i)}
          disabled={!isMyTurn || busy || finished || !!cell}
          aria-label={cell ? `Square ${i + 1}, taken` : `Play square ${i + 1}`}
          className={[
            'aspect-square rounded-xl grid place-items-center text-3xl font-black transition-colors',
            cell ? 'glass text-ink' : 'bg-white/5 hover:bg-white/10 disabled:hover:bg-white/5',
            cell === myRole ? 'text-rose' : '',
          ].join(' ')}
        >
          {cell ? MARK[cell] : ''}
        </button>
      ))}
    </div>
  )
}

export const ticTacToe: GameDef<TicTacToeState> = {
  kind: 'tic_tac_toe',
  name: 'Noughts & Crosses',
  emoji: '⭕',
  blurb: 'Three in a row. Ten seconds, tops.',
  initialState: () => ({ cells: Array(9).fill(null) }),
  status: (_state, myRole, isMyTurn, outcome) => {
    if (outcome === 'draw') return "A draw — nobody's getting three."
    if (outcome) return outcome === 'won' ? 'You win.' : 'They win this one.'
    return isMyTurn ? `Your turn — you're ${MARK[myRole]}` : 'Waiting for them'
  },
  Board,
}
