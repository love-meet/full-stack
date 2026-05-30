import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Board, Move, PieceColor, Square } from '../../lib/draughts'
import { isLost, legalMoves, legalMovesFrom } from '../../lib/draughts'
import { useConcedeDraughtsRound, useSubmitDraughtsMove } from '../../hooks/useDraughts'

/**
 * Interactive Draughts board with smoothly-animated pieces.
 *
 * Layout: a single absolutely-positioned layer of cells (clickable, for
 * selecting / placing) sits beneath a second layer of pieces (motion divs,
 * non-interactive, animated by id between board positions). When a piece
 * moves we update its row/col on the same React element — Framer Motion's
 * spring interpolates it across the squares, so movement actually looks
 * like movement instead of a teleport.
 *
 * The board is rotated so the VIEWER always sees their own pieces at the
 * bottom — red player gets a flipped board, black sees the natural one,
 * spectators see the natural one too.
 */
export default function DraughtsBoard({
  gameId, round, board, myColor, myTurn,
}: {
  gameId: string
  round: number
  board: Board
  myColor: PieceColor | null
  myTurn: boolean
}) {
  const [selected, setSelected] = useState<Square | null>(null)
  const move = useSubmitDraughtsMove()
  const concede = useConcedeDraughtsRound()

  const myLegal = useMemo(
    () => (myColor && myTurn ? legalMoves(board, myColor) : []),
    [board, myColor, myTurn],
  )
  useEffect(() => { setSelected(null) }, [board])

  // No-move auto-concede.
  useEffect(() => {
    if (myColor && myTurn && myLegal.length === 0) {
      const t = window.setTimeout(() => concede.mutate({ gameId, round }), 600)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myColor, myTurn, myLegal.length, gameId, round])

  const movesFromSelected = useMemo<Move[]>(
    () => (selected && myColor ? legalMovesFrom(board, selected, myColor) : []),
    [selected, board, myColor],
  )
  const squareLegalDest = (r: number, c: number) =>
    movesFromSelected.find((m) => m.to.r === r && m.to.c === c) ?? null
  const squareIsMyPiece = (r: number, c: number) =>
    !!board.find((p) => p.r === r && p.c === c && p.color === myColor)
  const squareHasLegalMove = (r: number, c: number) =>
    myLegal.some((m) => m.from.r === r && m.from.c === c)

  function onSquareTap(r: number, c: number) {
    if (!myColor || !myTurn) return
    const dest = squareLegalDest(r, c)
    if (dest) {
      move.mutate({ gameId, round, from: dest.from, to: dest.to, captures: dest.captures })
      setSelected(null)
      return
    }
    if (squareIsMyPiece(r, c) && squareHasLegalMove(r, c)) {
      setSelected({ r, c })
      return
    }
    setSelected(null)
  }

  // Viewer-at-bottom rotation: red's home is rows 0-2, so red flips; black
  // and spectators see the natural orientation (black home at rows 5-7).
  const flip = myColor === 'r'
  const toDisp = (r: number, c: number) => ({
    dr: flip ? 7 - r : r,
    dc: flip ? 7 - c : c,
  })

  const gameOver = myColor ? isLost(board, myColor === 'r' ? 'b' : 'r') : false

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className="relative aspect-square w-full rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl select-none"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Cells layer — captures taps. */}
        {Array.from({ length: 64 }).map((_, i) => {
          const r = Math.floor(i / 8)
          const c = i % 8
          const { dr, dc } = toDisp(r, c)
          const dark = (r + c) % 2 === 1
          const dest = squareLegalDest(r, c)
          const isSelected = !!selected && selected.r === r && selected.c === c
          return (
            <button
              key={`cell-${r}-${c}`}
              onClick={() => onSquareTap(r, c)}
              disabled={!myTurn}
              style={{
                position: 'absolute',
                top: `${dr * 12.5}%`,
                left: `${dc * 12.5}%`,
                width: '12.5%',
                height: '12.5%',
              }}
              className={[
                'transition-colors',
                dark ? 'bg-[#3a2a4a]' : 'bg-[#b89880]',
                isSelected ? 'ring-2 ring-inset ring-gold/60' : '',
                myTurn ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              {dest && (
                <span className="absolute inset-0 grid place-items-center pointer-events-none">
                  <span className="w-1/3 h-1/3 rounded-full bg-gold/70 ring-2 ring-gold animate-pulse" />
                </span>
              )}
            </button>
          )
        })}

        {/* Pieces layer — animated by stable id. */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {board.map((piece) => {
              const { dr, dc } = toDisp(piece.r, piece.c)
              const isSelected = !!selected && selected.r === piece.r && selected.c === piece.c
              const canSelect = piece.color === myColor && squareHasLegalMove(piece.r, piece.c)
              return (
                <motion.div
                  key={piece.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    top: `${dr * 12.5}%`,
                    left: `${dc * 12.5}%`,
                    scale: isSelected ? 1.08 : 1,
                    opacity: 1,
                  }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  style={{ position: 'absolute', width: '12.5%', height: '12.5%' }}
                  className="grid place-items-center"
                >
                  <span
                    className={[
                      'w-[78%] aspect-square rounded-full grid place-items-center text-xl shadow-lg',
                      piece.color === 'r'
                        ? 'bg-gradient-to-br from-rose to-magenta text-white'
                        : 'bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-800',
                      isSelected ? 'ring-4 ring-gold' : '',
                      canSelect && !isSelected ? 'ring-2 ring-gold/40' : '',
                    ].join(' ')}
                  >
                    {piece.king ? '👑' : ''}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-3 text-center text-sm text-ink-2">
        {!myColor ? (
          <span>You're watching this match.</span>
        ) : myTurn ? (
          myLegal.length === 0 ? (
            <span className="text-danger font-semibold">No legal moves — conceding…</span>
          ) : (
            <span className="text-gold font-semibold">
              Your turn{myLegal.some((m) => m.captures.length > 0) ? ' (capture available!)' : ''}
            </span>
          )
        ) : (
          <span>Waiting for the other player…</span>
        )}
        {gameOver && <span className="block text-success font-bold mt-1">You won the board!</span>}
      </div>
    </div>
  )
}
