/**
 * English / American Checkers rules engine, in TypeScript so the board UI
 * can preview legal moves, force captures and detect "no legal moves"
 * locally. The server mirrors the same shape checks and is the source of
 * truth for the actual board state.
 */

export type PieceColor = 'r' | 'b'
export type Piece = { r: number; c: number; color: PieceColor; king: boolean }
export type Board = Piece[]
export type Square = { r: number; c: number }

/** A move from one square to another, possibly capturing pieces along the way. */
export type Move = {
  from: Square
  to: Square
  /** Squares of pieces removed by this move (empty for a plain step). */
  captures: Square[]
}

export const BOARD_SIZE = 8

export function initialBoard(): Board {
  const out: Board = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) out.push({ r, c, color: 'r', king: false })
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) out.push({ r, c, color: 'b', king: false })
    }
  }
  return out
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
}

/** Index pieces by square for fast lookup. */
function indexBoard(board: Board): Map<string, Piece> {
  const m = new Map<string, Piece>()
  for (const p of board) m.set(`${p.r},${p.c}`, p)
  return m
}

const FORWARD: Record<PieceColor, number[]> = { r: [1], b: [-1] }
const ALL_DIRS = [1, -1]

/** All capture sequences starting from a given piece. A "capture sequence"
 *  is the chain of jumps required (multi-jumps are mandatory once you've
 *  started capturing — you keep jumping until you can't). Returns the
 *  ENDPOINT moves (each starting from `piece`) so the UI can offer them. */
function capturesFrom(piece: Piece, board: Board): Move[] {
  const moves: Move[] = []
  const idx = indexBoard(board)
  const dirs = piece.king ? ALL_DIRS : FORWARD[piece.color]

  // Depth-first walk. At each step, try every diagonal direction with a
  // 2-square jump over an opponent piece into an empty square. Track which
  // pieces were already taken on this branch so we don't take them twice.
  function walk(curR: number, curC: number, captured: string[], path: Square[]) {
    let extended = false
    for (const dr of dirs) {
      for (const dc of ALL_DIRS) {
        const midR = curR + dr
        const midC = curC + dc
        const dstR = curR + 2 * dr
        const dstC = curC + 2 * dc
        if (!inBounds(dstR, dstC)) continue
        // Destination must be empty (or be the origin square if we ever loop back,
        // which checkers can't — kings can but not in a single chain).
        if (idx.has(`${dstR},${dstC}`)) continue
        const midKey = `${midR},${midC}`
        if (captured.includes(midKey)) continue
        const midPiece = idx.get(midKey)
        if (!midPiece || midPiece.color === piece.color) continue
        // Recurse.
        extended = true
        walk(dstR, dstC, [...captured, midKey], [...path, { r: dstR, c: dstC }])
      }
    }
    if (!extended && path.length > 1) {
      moves.push({
        from: { r: piece.r, c: piece.c },
        to: path[path.length - 1],
        captures: captured.map((k) => {
          const [r, c] = k.split(',').map(Number); return { r, c }
        }),
      })
    }
  }
  walk(piece.r, piece.c, [], [{ r: piece.r, c: piece.c }])
  return moves
}

/** Plain non-capture moves (single diagonal step into empty square). */
function plainStepsFrom(piece: Piece, board: Board): Move[] {
  const idx = indexBoard(board)
  const dirs = piece.king ? ALL_DIRS : FORWARD[piece.color]
  const moves: Move[] = []
  for (const dr of dirs) {
    for (const dc of ALL_DIRS) {
      const nr = piece.r + dr
      const nc = piece.c + dc
      if (!inBounds(nr, nc)) continue
      if (idx.has(`${nr},${nc}`)) continue
      moves.push({ from: { r: piece.r, c: piece.c }, to: { r: nr, c: nc }, captures: [] })
    }
  }
  return moves
}

/** All legal moves for a side, honouring the forced-capture rule. */
export function legalMoves(board: Board, color: PieceColor): Move[] {
  const myPieces = board.filter((p) => p.color === color)
  const allCaptures = myPieces.flatMap((p) => capturesFrom(p, board))
  if (allCaptures.length > 0) return allCaptures   // forced — pure-step moves disallowed
  return myPieces.flatMap((p) => plainStepsFrom(p, board))
}

/** Legal moves filtered to a specific source square — used by the UI when
 *  the player taps a piece. Returns empty array if that piece has no legal
 *  move (or if captures elsewhere are forced and this piece can't capture). */
export function legalMovesFrom(board: Board, square: Square, color: PieceColor): Move[] {
  return legalMoves(board, color).filter(
    (m) => m.from.r === square.r && m.from.c === square.c,
  )
}

/** Apply a move (assumed legal) and return the new board. Handles king
 *  promotion when a piece lands on the opposite back rank. */
export function applyMove(board: Board, move: Move): Board {
  const removed = new Set([
    `${move.from.r},${move.from.c}`,
    ...move.captures.map((s) => `${s.r},${s.c}`),
  ])
  const survivor = board.find((p) => p.r === move.from.r && p.c === move.from.c)
  if (!survivor) return board
  const next = board.filter((p) => !removed.has(`${p.r},${p.c}`))
  const promoted =
    (survivor.color === 'r' && move.to.r === 7) ||
    (survivor.color === 'b' && move.to.r === 0)
  next.push({
    r: move.to.r,
    c: move.to.c,
    color: survivor.color,
    king: survivor.king || promoted,
  })
  return next
}

/** Has the given side lost? — no pieces, or no legal move. */
export function isLost(board: Board, color: PieceColor): boolean {
  if (!board.some((p) => p.color === color)) return true
  return legalMoves(board, color).length === 0
}
