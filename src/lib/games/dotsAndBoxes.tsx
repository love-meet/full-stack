/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import type { BoardProps, GameDef, Role } from './types'
import { other } from './types'

/** 3×3 boxes — small enough to finish in a couple of minutes of chat. */
export const SIZE = 3

export type DotsState = {
  /** Horizontal edges: (SIZE+1) rows × SIZE columns. */
  h: (Role | null)[][]
  /** Vertical edges: SIZE rows × (SIZE+1) columns. */
  v: (Role | null)[][]
  boxes: (Role | null)[][]
}

const COLOR: Record<Role, string> = { a: 'bg-rose', b: 'bg-gold' }
const TEXT: Record<Role, string> = { a: 'text-rose', b: 'text-gold' }

function countBoxes(boxes: (Role | null)[][], role: Role): number {
  return boxes.flat().filter((b) => b === role).length
}

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<DotsState>) {
  function draw(kind: 'h' | 'v', r: number, c: number) {
    if (!isMyTurn || busy || finished) return
    if (state[kind][r][c]) return

    const h = state.h.map((row) => row.slice())
    const v = state.v.map((row) => row.slice())
    const boxes = state.boxes.map((row) => row.slice())
    if (kind === 'h') h[r][c] = myRole
    else v[r][c] = myRole

    // Claim any box this edge just closed.
    let claimed = 0
    for (let br = 0; br < SIZE; br++) {
      for (let bc = 0; bc < SIZE; bc++) {
        if (boxes[br][bc]) continue
        if (h[br][bc] && h[br + 1][bc] && v[br][bc] && v[br][bc + 1]) {
          boxes[br][bc] = myRole
          claimed++
        }
      }
    }

    const next = { h, v, boxes }
    const done = boxes.flat().every(Boolean)
    const mine = countBoxes(boxes, myRole)
    const theirs = countBoxes(boxes, other(myRole))

    onMove({
      state: next,
      // Close a box, go again — the rule that makes the endgame interesting.
      nextTurn: claimed > 0 ? myRole : other(myRole),
      finished: done,
      winner: done ? (mine === theirs ? null : mine > theirs ? myRole : other(myRole)) : null,
      summary: done
        ? (mine > theirs ? 'won at Dots and Boxes' : mine === theirs ? 'drew at Dots and Boxes' : 'finished the game')
        : claimed > 0 ? `closed ${claimed === 1 ? 'a box' : `${claimed} boxes`}` : 'drew a line',
    })
  }

  const cell = 'w-10 h-10'
  const dot = <span className="w-2 h-2 rounded-full bg-white/50 shrink-0" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-4 text-sm font-bold">
        <span className={TEXT[myRole]}>You {countBoxes(state.boxes, myRole)}</span>
        <span className="text-ink-muted">—</span>
        <span className={TEXT[other(myRole)]}>{countBoxes(state.boxes, other(myRole))} Them</span>
      </div>

      <div className="flex flex-col items-center">
        {Array.from({ length: SIZE + 1 }).map((_, r) => (
          <div key={r}>
            {/* Row of dots joined by horizontal edges */}
            <div className="flex items-center">
              {Array.from({ length: SIZE }).map((__, c) => (
                <div key={c} className="flex items-center">
                  {dot}
                  <button
                    onClick={() => draw('h', r, c)}
                    disabled={!isMyTurn || busy || finished || !!state.h[r][c]}
                    aria-label={`Horizontal line row ${r + 1} column ${c + 1}`}
                    className={`${cell} h-2 px-0.5 grid place-items-center group disabled:cursor-default`}
                  >
                    <span
                      className={[
                        'w-full h-1 rounded-full transition-colors',
                        state.h[r][c] ? COLOR[state.h[r][c]!] : 'bg-white/10 group-hover:bg-white/30',
                      ].join(' ')}
                    />
                  </button>
                </div>
              ))}
              {dot}
            </div>

            {/* Row of vertical edges with the box fills between them */}
            {r < SIZE && (
              <div className="flex items-center">
                {Array.from({ length: SIZE }).map((__, c) => (
                  <div key={c} className="flex items-center">
                    <button
                      onClick={() => draw('v', r, c)}
                      disabled={!isMyTurn || busy || finished || !!state.v[r][c]}
                      aria-label={`Vertical line row ${r + 1} column ${c + 1}`}
                      className="w-2 h-10 py-0.5 grid place-items-center group disabled:cursor-default"
                    >
                      <span
                        className={[
                          'h-full w-1 rounded-full transition-colors',
                          state.v[r][c] ? COLOR[state.v[r][c]!] : 'bg-white/10 group-hover:bg-white/30',
                        ].join(' ')}
                      />
                    </button>
                    <span
                      className={[
                        'w-10 h-10 grid place-items-center text-xs font-black',
                        state.boxes[r][c] === myRole ? 'text-rose' : 'text-gold',
                      ].join(' ')}
                    >
                      {state.boxes[r][c] ? (state.boxes[r][c] === myRole ? 'You' : '·') : ''}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => draw('v', r, SIZE)}
                  disabled={!isMyTurn || busy || finished || !!state.v[r][SIZE]}
                  aria-label={`Vertical line row ${r + 1} column ${SIZE + 1}`}
                  className="w-2 h-10 py-0.5 grid place-items-center group disabled:cursor-default"
                >
                  <span
                    className={[
                      'h-full w-1 rounded-full transition-colors',
                      state.v[r][SIZE] ? COLOR[state.v[r][SIZE]!] : 'bg-white/10 group-hover:bg-white/30',
                    ].join(' ')}
                  />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export const dotsAndBoxes: GameDef<DotsState> = {
  kind: 'dots_and_boxes',
  name: 'Dots & Boxes',
  emoji: '⬛',
  blurb: 'Draw a line. Close a box, go again. Most boxes wins.',
  initialState: () => ({
    h: Array.from({ length: SIZE + 1 }, () => Array<Role | null>(SIZE).fill(null)),
    v: Array.from({ length: SIZE }, () => Array<Role | null>(SIZE + 1).fill(null)),
    boxes: Array.from({ length: SIZE }, () => Array<Role | null>(SIZE).fill(null)),
  }),
  status: (_state, _myRole, isMyTurn, outcome) => {
    if (outcome === 'draw') return 'A draw — honours even.'
    if (outcome) return outcome === 'won' ? 'You win.' : 'They win this one.'
    return isMyTurn ? 'Your turn — draw a line' : 'Waiting for them'
  },
  Board,
}
