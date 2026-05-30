import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Board, Move, PieceColor, Square } from '../../lib/draughts'
import { isLost, legalMoves, legalMovesFrom } from '../../lib/draughts'
import { useConcedeDraughtsRound, useSubmitDraughtsMove } from '../../hooks/useDraughts'

/**
 * Draughts board with a wooden frame, snap-fast piece movement, and an
 * optimistic local update so a tap shows the move instantly. Server confirms
 * via realtime; on error the move snaps back.
 *
 * Layout: an inset of cell-buttons (clickable) + an overlay of motion divs
 * (one per piece, keyed by stable id) with `top`/`left` animated cheaply so
 * the piece appears at its destination without a slow "slide" feel.
 *
 * Orientation: red player gets the board flipped (their pieces appear at the
 * bottom); black + spectators see the natural view. Either way, the viewer's
 * own pieces sit at the bottom of their screen.
 */
export default function DraughtsBoard({
  gameId, round, board, myColor, myTurn, opponentId,
}: {
  gameId: string
  round: number
  board: Board
  myColor: PieceColor | null
  myTurn: boolean
  opponentId: string | null
}) {
  const [selected, setSelected] = useState<Square | null>(null)
  const move = useSubmitDraughtsMove()
  const concede = useConcedeDraughtsRound()

  const myLegal = useMemo(
    () => (myColor && myTurn ? legalMoves(board, myColor) : []),
    [board, myColor, myTurn],
  )
  useEffect(() => { setSelected(null) }, [board])

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
      move.mutate({
        gameId, round,
        from: dest.from, to: dest.to, captures: dest.captures,
        opponentId,
      })
      setSelected(null)
      return
    }
    if (squareIsMyPiece(r, c) && squareHasLegalMove(r, c)) {
      setSelected({ r, c })
      return
    }
    setSelected(null)
  }

  // Viewer-at-bottom: red home is rows 0-2, so red flips.
  const flip = myColor === 'r'
  const toDisp = (r: number, c: number) => ({
    dr: flip ? 7 - r : r,
    dc: flip ? 7 - c : c,
  })

  const gameOver = myColor ? isLost(board, myColor === 'r' ? 'b' : 'r') : false

  // Coordinate labels (a–h, 1–8). Reversed when flipped so they stay aligned
  // with how the player would name them.
  const cols = flip ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h']
  const rows = flip ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1]

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Wooden frame — warm gradient + inset shadow + dark rim. */}
      <div
        className="p-3 rounded-2xl shadow-2xl"
        style={{
          background:
            'linear-gradient(135deg, #6d3f17 0%, #4a2a0e 50%, #2d1808 100%)',
          boxShadow:
            '0 18px 40px -12px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -2px 6px rgba(0,0,0,0.55)',
        }}
      >
        {/* Inner column-letter strip (top). */}
        <div className="flex justify-between px-1 pb-1 select-none">
          {cols.map((l) => (
            <span key={`tc-${l}`} className="flex-1 text-center text-[10px] font-bold text-amber-200/80">{l}</span>
          ))}
        </div>

        <div className="flex">
          {/* Row numbers (left). */}
          <div className="flex flex-col justify-around pr-1 select-none">
            {rows.map((n) => (
              <span key={`lr-${n}`} className="text-[10px] font-bold text-amber-200/80 leading-none">{n}</span>
            ))}
          </div>

          {/* Playing surface. */}
          <div
            className="relative aspect-square flex-1 rounded-md overflow-hidden ring-1 ring-black/60 select-none"
            style={{ touchAction: 'manipulation', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.55)' }}
          >
            {/* Cells layer */}
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
                    background: dark ? '#3a2a4a' : '#d6b88f',
                  }}
                  className={[
                    'transition-colors',
                    isSelected ? 'ring-2 ring-inset ring-gold/70' : '',
                    myTurn ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {dest && (
                    <span className="absolute inset-0 grid place-items-center pointer-events-none">
                      <span className="w-1/3 h-1/3 rounded-full bg-gold/80 ring-2 ring-gold animate-pulse" />
                    </span>
                  )}
                </button>
              )
            })}

            {/* Pieces layer — snap-fast position changes; enter/exit fade. */}
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
                      transition={{
                        // Position changes feel "snap-fast" — short ease-out so
                        // the player sees their tap land immediately, but the
                        // opponent still perceives the move direction.
                        top:  { duration: 0.12, ease: 'easeOut' },
                        left: { duration: 0.12, ease: 'easeOut' },
                        scale: { type: 'spring', stiffness: 380, damping: 26 },
                        opacity: { duration: 0.18 },
                      }}
                      style={{ position: 'absolute', width: '12.5%', height: '12.5%' }}
                      className="grid place-items-center"
                    >
                      <span
                        className={[
                          'w-[78%] aspect-square rounded-full grid place-items-center text-xl shadow-[0_3px_6px_rgba(0,0,0,0.5)]',
                          piece.color === 'r'
                            ? 'bg-gradient-to-br from-rose to-magenta text-white'
                            : 'bg-gradient-to-br from-zinc-100 to-zinc-400 text-zinc-800',
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

          {/* Row numbers (right, mirrored — keeps the frame symmetrical). */}
          <div className="flex flex-col justify-around pl-1 select-none">
            {rows.map((n) => (
              <span key={`rr-${n}`} className="text-[10px] font-bold text-amber-200/80 leading-none">{n}</span>
            ))}
          </div>
        </div>

        {/* Column letters (bottom). */}
        <div className="flex justify-between px-1 pt-1 select-none">
          {cols.map((l) => (
            <span key={`bc-${l}`} className="flex-1 text-center text-[10px] font-bold text-amber-200/80">{l}</span>
          ))}
        </div>
      </div>

      {/* Status line below the board. */}
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
