// Synced copy of src/lib/draughts.ts's pure rules engine (legalMoves /
// applyMove / isLost) — duplicated here rather than imported across the
// src/ ↔ supabase/functions/ boundary because Supabase bundles each Edge
// Function directory independently. Keep this in sync if the rules change.
//
// See src/lib/draughts.ts for the full rules commentary.

export type PieceColor = 'r' | 'b'
export type Piece = { id: number; r: number; c: number; color: PieceColor; king: boolean }
export type Board = Piece[]
export type Square = { r: number; c: number }
export type Move = { from: Square; to: Square; captures: Square[] }

const BOARD_SIZE = 8

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
}

const FORWARD_DR: Record<PieceColor, 1 | -1> = { r: 1, b: -1 }
const DIAGS: Array<[1 | -1, 1 | -1]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function plainStepsFrom(piece: Piece, idx: Map<string, Piece>): Move[] {
  const moves: Move[] = []
  if (piece.king) {
    for (const [dr, dc] of DIAGS) {
      let r = piece.r + dr, c = piece.c + dc
      while (inBounds(r, c) && !idx.has(`${r},${c}`)) {
        moves.push({ from: { r: piece.r, c: piece.c }, to: { r, c }, captures: [] })
        r += dr; c += dc
      }
    }
  } else {
    const dr = FORWARD_DR[piece.color]
    for (const dc of [-1, 1] as const) {
      const nr = piece.r + dr, nc = piece.c + dc
      if (inBounds(nr, nc) && !idx.has(`${nr},${nc}`)) {
        moves.push({ from: { r: piece.r, c: piece.c }, to: { r: nr, c: nc }, captures: [] })
      }
    }
  }
  return moves
}

function pawnCapturesFrom(piece: Piece, board: Board): Move[] {
  const idx = indexBoard(board)
  const out: Move[] = []
  function walk(curR: number, curC: number, captured: string[], path: Square[]) {
    let extended = false
    for (const [dr, dc] of DIAGS) {
      const midR = curR + dr, midC = curC + dc
      const dstR = curR + 2 * dr, dstC = curC + 2 * dc
      if (!inBounds(dstR, dstC)) continue
      if (idx.has(`${dstR},${dstC}`) && !(dstR === piece.r && dstC === piece.c)) continue
      const midKey = `${midR},${midC}`
      if (captured.includes(midKey)) continue
      const midOcc = idx.get(midKey)
      if (!midOcc || midOcc.color === piece.color) continue
      extended = true
      walk(dstR, dstC, [...captured, midKey], [...path, { r: dstR, c: dstC }])
    }
    if (!extended && path.length > 1) {
      out.push({
        from: { r: piece.r, c: piece.c },
        to: path[path.length - 1],
        captures: captured.map((k) => { const [r, c] = k.split(',').map(Number); return { r, c } }),
      })
    }
  }
  walk(piece.r, piece.c, [], [{ r: piece.r, c: piece.c }])
  return out
}

function kingCapturesFrom(piece: Piece, board: Board): Move[] {
  const idx = indexBoard(board)
  const out: Move[] = []
  function walk(curR: number, curC: number, captured: string[], path: Square[]) {
    let extended = false
    for (const [dr, dc] of DIAGS) {
      let r = curR + dr, c = curC + dc
      let oppKey: string | null = null
      while (inBounds(r, c)) {
        const key = `${r},${c}`
        const occ = idx.get(key)
        const occRemoved = !!occ && captured.includes(key)
        const occBlocking = !!occ && !occRemoved
        const isStartSquare = r === piece.r && c === piece.c
        if (occBlocking) {
          if (occ.color === piece.color) break
          if (oppKey) break
          oppKey = key
        } else if (isStartSquare || !occBlocking) {
          if (oppKey) {
            extended = true
            walk(r, c, [...captured, oppKey], [...path, { r, c }])
          }
        }
        r += dr; c += dc
      }
    }
    if (!extended && path.length > 1) {
      out.push({
        from: { r: piece.r, c: piece.c },
        to: path[path.length - 1],
        captures: captured.map((k) => { const [r, c] = k.split(',').map(Number); return { r, c } }),
      })
    }
  }
  walk(piece.r, piece.c, [], [{ r: piece.r, c: piece.c }])
  return out
}

function indexBoard(board: Board): Map<string, Piece> {
  const m = new Map<string, Piece>()
  for (const p of board) m.set(`${p.r},${p.c}`, p)
  return m
}

function capturesFrom(piece: Piece, board: Board): Move[] {
  return piece.king ? kingCapturesFrom(piece, board) : pawnCapturesFrom(piece, board)
}

export function legalMoves(board: Board, color: PieceColor): Move[] {
  const idx = indexBoard(board)
  const myPieces = board.filter((p) => p.color === color)
  const allCaptures = myPieces.flatMap((p) => capturesFrom(p, board))
  if (allCaptures.length > 0) return allCaptures
  return myPieces.flatMap((p) => plainStepsFrom(p, idx))
}

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
  next.push({ id: survivor.id, r: move.to.r, c: move.to.c, color: survivor.color, king: survivor.king || promoted })
  return next
}

export function isLost(board: Board, color: PieceColor): boolean {
  if (!board.some((p) => p.color === color)) return true
  return legalMoves(board, color).length === 0
}

/**
 * Pick a move for the bot: prefer capture chains that take the most pieces
 * (already forced by legalMoves when any capture exists — this just breaks
 * ties among multiple capture options), otherwise mildly prefer moves that
 * advance toward promotion or move a king to safety. Not minimax — this is
 * a casual mobile-game opponent, not a solver — but noticeably better than
 * picking uniformly at random.
 */
export function pickMove(board: Board, color: PieceColor): Move | null {
  const moves = legalMoves(board, color)
  if (moves.length === 0) return null

  const scored = moves.map((m) => {
    let score = 0
    score += m.captures.length * 10 // longest capture chain wins ties
    const forwardDr = FORWARD_DR[color]
    score += (m.to.r - m.from.r) * forwardDr // advancing toward the back rank
    const promotes = (color === 'r' && m.to.r === 7) || (color === 'b' && m.to.r === 0)
    if (promotes) score += 5
    score += Math.random() * 2 // small jitter so the bot isn't perfectly deterministic
    return { move: m, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].move
}
