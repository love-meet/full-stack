import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../stores/auth'
import {
  useMyRole,
  usePlayChatMove,
  useRespondChatGame,
  useResignChatGame,
  isStaleMove,
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

  async function onMove(result: MoveResult<unknown>) {
    setError(null)
    try {
      await play.mutateAsync({
        gameId: game.id,
        expectedMove: game.move_count,
        result,
      })
    } catch (e) {
      // A stale move means they moved first. The refetch already fired; the
      // board is about to redraw, so say so rather than showing a raw error.
      setError(isStaleMove(e) ? 'They moved first — here’s the new board.' : (e as Error).message)
    }
  }

  // ── Invite, not yet answered ──
  if (game.status === 'invited') {
    const mine = game.player_a === myId
    return (
      <Shell def={def}>
        {mine ? (
          <p className="text-sm text-ink-2">Invite sent. Waiting for them to accept.</p>
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
          </>
        )}
      </Shell>
    )
  }

  const BoardComponent = def.Board as unknown as React.ComponentType<{
    gameId: string
    state: unknown
    myRole: typeof myRole
    isMyTurn: boolean
    finished: boolean
    outcome: Outcome
    busy: boolean
    onMove: (r: MoveResult<unknown>) => void
  }>

  return (
    <Shell def={def}>
      <BoardComponent
        gameId={game.id}
        state={game.state}
        myRole={myRole}
        isMyTurn={isMyTurn}
        finished={finished}
        outcome={outcome}
        busy={play.isPending}
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
