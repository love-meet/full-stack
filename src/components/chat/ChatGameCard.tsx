import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../stores/auth'
import {
  useMyRole,
  usePlayChatMove,
  useRespondChatGame,
  useResignChatGame,
  isStaleLike,
  errMessage,
  type ChatGame,
} from '../../hooks/useChatGames'
import { gameFor } from '../../lib/games'
import type { MoveResult, Outcome } from '../../lib/games/types'

/**
 * One game, inline in the conversation (§8).
 *
 * No lobby and no spectators — if you can see this card you are one of the
 * two players. No presence either: the card says whose turn it is, never who
 * is online.
 */
export default function ChatGameCard({ game }: { game: ChatGame }) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const myRole = useMyRole(game)
  const def = gameFor(game.kind)
  const play = usePlayChatMove(game.conversation_id)
  const respond = useRespondChatGame(game.conversation_id)
  const resign = useResignChatGame(game.conversation_id)
  const [error, setError] = useState<string | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)

  if (!def || !myRole) return null

  const finished = game.status === 'finished'
  const isMyTurn = game.turn_user_id === myId && game.status === 'active'
  const outcome: Outcome = !finished
    ? null
    : game.is_draw
      ? 'draw'
      : game.winner_user_id === myId
        ? 'won'
        : 'lost'
  const busy = play.isPending || respond.isPending || resign.isPending

  async function onMove(result: MoveResult<unknown>): Promise<boolean> {
    setError(null)
    try {
      await play.mutateAsync({
        gameId: game.id,
        expectedMove: game.move_count,
        result,
      })
      return true
    } catch (e) {
      // Stale-like covers everything meaning "the row is not what this move
      // assumed": a stale move, an out-of-turn call, or a repeated guess.
      // The refetch already fired (usePlayChatMove.onError), so the board is
      // about to redraw — say so rather than showing the raw server text.
      setError(isStaleLike(e) ? 'They moved first — here’s the new board.' : errMessage(e))
      return false
    }
  }

  // ── Invite, not yet answered ──
  if (game.status === 'invited') {
    const mine = game.player_a === myId
    return (
      <Shell def={def}>
        {mine ? (
          <>
            <p className="text-sm text-ink-2">Invite sent. Waiting for them to accept.</p>
            <div className="mt-3 text-center">
              <button
                onClick={async () => {
                  try {
                    const row = await resign.mutateAsync(game.id)
                    // 0114: withdrawing an `invited` row normally records a
                    // decline (status 'declined', no winner) — that status is
                    // excluded from the games query, so the card disappears
                    // on its own once the invalidate lands; no local
                    // dismissal needed. But if the invitee's accept landed
                    // first, the RPC finds an `active` row instead and
                    // records a real forfeit (status 'finished'). Don't hide
                    // that outcome — say what happened.
                    if (row.status === 'finished') {
                      setError('They accepted just before your withdrawal landed — the game finished instead.')
                    }
                  } catch (e) {
                    setError(errMessage(e))
                  }
                }}
                disabled={resign.isPending}
                className="text-xs text-ink-muted hover:text-danger disabled:opacity-60"
              >
                Withdraw
              </button>
            </div>
            {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-2">{def.blurb}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => respond.mutate({ gameId: game.id, accept: true })}
                disabled={respond.isPending}
                className="flex-1 rounded-full py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose disabled:opacity-60"
              >
                Play
              </button>
              <button
                onClick={() => respond.mutate({ gameId: game.id, accept: false })}
                disabled={respond.isPending}
                className="rounded-full px-5 py-2.5 glass text-sm font-semibold text-ink-2"
              >
                No thanks
              </button>
            </div>
            {respond.error && (
              <p className="mt-2 text-center text-xs text-danger">{errMessage(respond.error)}</p>
            )}
          </>
        )}
      </Shell>
    )
  }

  const BoardComponent = def.Board

  return (
    <Shell def={def}>
      <BoardComponent
        gameId={game.id}
        state={game.state as never}
        myRole={myRole}
        isMyTurn={isMyTurn}
        finished={finished}
        outcome={outcome}
        busy={busy}
        onMove={onMove}
      />

      <p
        className={[
          'mt-3 text-center text-sm font-semibold',
          outcome === 'won' ? 'text-success' : outcome === 'lost' ? 'text-ink-muted' : 'text-ink-2',
        ].join(' ')}
      >
        {def.status(game.state as never, myRole, isMyTurn, outcome)}
      </p>

      {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
      {resign.error && <p className="mt-2 text-center text-xs text-danger">{errMessage(resign.error)}</p>}

      {!finished && (
        <div className="mt-3 text-center">
          {confirmResign ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="text-ink-muted">Give them the win?</span>
              <button
                onClick={() => { setConfirmResign(false); resign.mutate(game.id) }}
                className="font-bold text-danger"
              >
                Resign
              </button>
              <button onClick={() => setConfirmResign(false)} className="text-ink-muted">
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmResign(true)}
              className="text-xs text-ink-muted hover:text-danger"
            >
              Resign
            </button>
          )}
        </div>
      )}
    </Shell>
  )
}

function Shell({
  def, children,
}: {
  def: { name: string; emoji: string }
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 my-2 mx-auto w-full max-w-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg leading-none">{def.emoji}</span>
        <h3 className="text-sm font-extrabold text-ink">{def.name}</h3>
      </div>
      {children}
    </motion.div>
  )
}
