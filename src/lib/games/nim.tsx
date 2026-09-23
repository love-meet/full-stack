/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import type { BoardProps, GameDef } from './types'
import { other } from './types'

/** Twenty-one matchsticks. Take 1, 2 or 3. Take the last one and you lose. */
export type NimState = { remaining: number }

export const START = 21
export const MAX_TAKE = 3

function Board({ state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<NimState>) {
  async function take(n: number) {
    if (!isMyTurn || busy || finished || n > state.remaining) return
    const remaining = state.remaining - n
    const tookLast = remaining === 0
    await onMove({
      state: { remaining },
      finished: tookLast,
      // Take the last stick and you lose.
      winner: tookLast ? other(myRole) : null,
      summary: tookLast ? 'took the last one and lost' : `took ${n}`,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-1 max-w-[17rem] mx-auto min-h-[3.5rem]">
        {Array.from({ length: state.remaining }).map((_, i) => (
          <span key={i} className="w-1.5 h-8 rounded-full bg-gradient-to-b from-gold to-coral" />
        ))}
        {state.remaining === 0 && (
          <span className="text-sm text-ink-muted self-center">All gone.</span>
        )}
      </div>

      <div className="text-center text-2xl font-extrabold text-ink tabular-nums">
        {state.remaining}
      </div>

      {!finished && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: MAX_TAKE }).map((_, i) => {
            const n = i + 1
            return (
              <button
                key={n}
                onClick={() => take(n)}
                disabled={!isMyTurn || busy || n > state.remaining}
                className="rounded-full px-5 py-2.5 glass text-sm font-bold text-ink hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                Take {n}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const nim: GameDef<NimState> = {
  kind: 'nim',
  name: 'Twenty-One',
  emoji: '🔥',
  blurb: `${START} sticks. Take 1–${MAX_TAKE}. Take the last one and you lose.`,
  initialState: () => ({ remaining: START }),
  status: (state, _myRole, isMyTurn, outcome) => {
    if (outcome) {
      return outcome === 'won'
        ? 'They took the last one. You win.'
        : 'You took the last one — they win.'
    }
    return isMyTurn ? `Your turn — take 1 to ${Math.min(MAX_TAKE, state.remaining)}` : 'Waiting for them'
  },
  Board,
}
