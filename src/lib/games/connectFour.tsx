/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import type { BoardProps, GameDef, Role } from './types'

export const COLS = 7
export const ROWS = 6

/** Column-major: `cols[c][0]` is the bottom of column c. */
export type ConnectFourState = { cols: Role[][] }

function winsAt(state: ConnectFourState, col: number, row: number, role: Role): boolean {
  const at = (c: number, r: number) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? state.cols[c][r] : undefined)
  const dirs: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]]
  for (const [dc, dr] of dirs) {
    let run = 1
    for (const sign of [1, -1]) {
      let c = col + dc * sign, r = row + dr * sign
      while (at(c, r) === role) { run++; c += dc * sign; r += dr * sign }
    }
    if (run >= 4) return true
  }
  return false
}

const DISC: Record<Role, string> = { a: 'bg-rose', b: 'bg-gold' }

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<ConnectFourState>) {
  function drop(c: number) {
    if (!isMyTurn || busy || finished) return
    if (state.cols[c].length >= ROWS) return
    const cols = state.cols.map((col) => col.slice())
    cols[c].push(myRole)
    const next = { cols }
    const won = winsAt(next, c, cols[c].length - 1, myRole)
    const full = cols.every((col) => col.length >= ROWS)
    onMove({
      state: next,
      finished: won || full,
      winner: won ? myRole : null,
      summary: won ? 'won at Connect Four' : full ? 'drew at Connect Four' : 'dropped a disc',
    })
  }

  return (
    <div className="w-full max-w-[19rem] mx-auto">
      <div className="grid grid-cols-7 gap-1 rounded-2xl bg-white/5 p-1.5">
        {Array.from({ length: COLS }).map((_, c) => (
          <button
            key={c}
            onClick={() => drop(c)}
            disabled={!isMyTurn || busy || finished || state.cols[c].length >= ROWS}
            aria-label={`Drop in column ${c + 1}`}
            className="flex flex-col-reverse gap-1 rounded-lg p-0.5 hover:bg-white/10 disabled:hover:bg-transparent transition-colors"
          >
            {Array.from({ length: ROWS }).map((__, r) => {
              const occupant = state.cols[c][r]
              return (
                <span
                  key={r}
                  className={[
                    'aspect-square rounded-full',
                    occupant ? DISC[occupant] : 'bg-black/40',
                  ].join(' ')}
                />
              )
            })}
          </button>
        ))}
      </div>
    </div>
  )
}

export const connectFour: GameDef<ConnectFourState> = {
  kind: 'connect_four',
  name: 'Connect Four',
  emoji: '🔴',
  blurb: 'Four in a row, any direction. Drop and go.',
  initialState: () => ({ cols: Array.from({ length: COLS }, () => [] as Role[]) }),
  status: (_state, _myRole, isMyTurn, outcome) => {
    if (outcome === 'draw') return 'A draw — board full.'
    if (outcome) return outcome === 'won' ? 'You win.' : 'They win this one.'
    return isMyTurn ? 'Your turn — pick a column' : 'Waiting for them'
  },
  Board,
}
