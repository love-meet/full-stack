import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Board, Move, PieceColor, Square } from '../../lib/draughts'
import { isLost, legalMoves, legalMovesFrom } from '../../lib/draughts'
import { useConcedeDraughtsRound, useSubmitDraughtsMove } from '../../hooks/useDraughts'

/**
 * Interactive 8×8 Draughts board.
 *
 * - When it's the viewer's turn, tapping one of their pieces highlights its
 *   legal moves; tapping a destination square submits the move to the server.
 * - Forced-capture rule is enforced via legalMoves(): if any capture is
 *   available somewhere on the board, only capturing moves are offered.
 * - When the viewer's side has no legal move, we automatically concede the
 *   round (server awards the win to the opponent) — saves the user from
 *   having to know about it.
 */
export default function DraughtsBoard({
  gameId, round, board, myColor, myTurn,
}: {
  gameId: string
  round: number
  board: Board
  /** 'r' / 'b' if we're a player; null if a spectator (board is read-only). */
  myColor: PieceColor | null
  /** Only true when it's our turn AND we have legal moves. */
  myTurn: boolean
}) {
  const [selected, setSelected] = useState<Square | null>(null)
  const move = useSubmitDraughtsMove()
  const concede = useConcedeDraughtsRound()

  // All legal moves for the current side (used for the forced-capture rule
  // even before a piece is selected).
  const myLegal = useMemo(
    () => (myColor && myTurn ? legalMoves(board, myColor) : []),
    [board, myColor, myTurn],
  )
  // Reset selection when the board changes (a move just landed).
  useEffect(() => { setSelected(null) }, [board])

  // If it's our turn and we have ZERO legal moves, concede so the opponent
  // gets the round and the match advances.
  useEffect(() => {
    if (myColor && myTurn && myLegal.length === 0) {
      // Slight delay so the realtime tick doesn't double-fire on a refresh.
      const t = window.setTimeout(() => {
        concede.mutate({ gameId, round })
      }, 600)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myColor, myTurn, myLegal.length, gameId, round])

  const movesFromSelected = useMemo<Move[]>(
    () => (selected && myColor ? legalMovesFrom(board, selected, myColor) : []),
    [selected, board, myColor],
  )

  function squareLegalDest(r: number, c: number): Move | null {
    return movesFromSelected.find((m) => m.to.r === r && m.to.c === c) ?? null
  }

  function squareIsMyPiece(r: number, c: number): boolean {
    return !!board.find((p) => p.r === r && p.c === c && p.color === myColor)
  }

  function squareHasLegalMove(r: number, c: number): boolean {
    return myLegal.some((m) => m.from.r === r && m.from.c === c)
  }

  function onSquareTap(r: number, c: number) {
    if (!myColor || !myTurn) return
    // Tapping a destination of the selected piece → submit the move.
    const dest = squareLegalDest(r, c)
    if (dest) {
      move.mutate({
        gameId, round,
        from: dest.from, to: dest.to, captures: dest.captures,
      })
      setSelected(null)
      return
    }
    // Tapping one of my pieces with at least one legal move → select it.
    if (squareIsMyPiece(r, c) && squareHasLegalMove(r, c)) {
      setSelected({ r, c })
      return
    }
    // Anything else → clear selection.
    setSelected(null)
  }

  // Render the board from the viewer's perspective: black plays from the
  // bottom, so if I'm black I see the board flipped vertically.
  const flip = myColor === 'b'
  const rowOrder = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const colOrder = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

  // Detection of game-over for the viewer side, for an empty-state hint.
  const gameOver = myColor ? isLost(board, myColor === 'r' ? 'b' : 'r') : false

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className="aspect-square w-full rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl select-none"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${8}, 1fr)`, gridTemplateRows: `repeat(${8}, 1fr)` }}
      >
        {rowOrder.flatMap((r) => colOrder.map((c) => {
          const dark = (r + c) % 2 === 1
          const piece = board.find((p) => p.r === r && p.c === c)
          const isSelected = !!selected && selected.r === r && selected.c === c
          const dest = squareLegalDest(r, c)
          const canSelect = squareIsMyPiece(r, c) && squareHasLegalMove(r, c)
          return (
            <button
              key={`${r}-${c}`}
              onClick={() => onSquareTap(r, c)}
              disabled={!myTurn}
              className={[
                'relative grid place-items-center transition-colors',
                dark ? 'bg-[#3a2a4a]' : 'bg-[#b89880]',
                myTurn ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              {/* legal-move target dot */}
              {dest && (
                <span className="absolute w-1/3 h-1/3 rounded-full bg-gold/70 ring-2 ring-gold animate-pulse" />
              )}
              {/* piece */}
              <AnimatePresence>
                {piece && (
                  <motion.span
                    key={`p-${piece.color}-${piece.king}`}
                    layout
                    layoutId={`piece-${r}-${c}`}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                    className={[
                      'w-[78%] aspect-square rounded-full grid place-items-center text-xl shadow-lg',
                      piece.color === 'r'
                        ? 'bg-gradient-to-br from-rose to-magenta text-white'
                        : 'bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-800',
                      isSelected ? 'ring-4 ring-gold scale-105' : '',
                      canSelect && !isSelected ? 'ring-1 ring-gold/40' : '',
                    ].join(' ')}
                  >
                    {piece.king ? '👑' : ''}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        }))}
      </div>

      {/* Status line */}
      <div className="mt-3 text-center text-sm text-ink-2">
        {!myColor ? (
          <span>You're watching this match.</span>
        ) : myTurn ? (
          myLegal.length === 0 ? (
            <span className="text-danger font-semibold">No legal moves — conceding…</span>
          ) : (
            <span className="text-gold font-semibold">Your turn{myLegal.some((m) => m.captures.length > 0) ? ' (capture available!)' : ''}</span>
          )
        ) : (
          <span>Waiting for the other player…</span>
        )}
        {gameOver && <span className="block text-success font-bold mt-1">You won the board!</span>}
      </div>
    </div>
  )
}
