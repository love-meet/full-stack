import { motion } from 'framer-motion'
import { GAMES } from '../../lib/games'
import { useCreateChatGame } from '../../hooks/useChatGames'
import type { ChatGameKind } from '../../lib/games/types'

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'Something went wrong.'
}

/**
 * Pick a game to play in this chat (§8).
 *
 * No lobby — picking one sends an invite into the conversation and that's the
 * whole flow. Nothing here gates a game behind anything else — pick it and
 * it's sent.
 */
export default function GamePickerSheet({
  conversationId,
  liveKinds,
  onClose,
}: {
  conversationId: string
  /** Kinds that already have an `invited`/`active` game in this conversation.
   *  `create_chat_game` returns that same existing row rather than starting
   *  a second one (0094: one live game per kind per conversation), so
   *  tapping one of these just closes the sheet instead of firing an RPC
   *  that visibly does nothing (D16). */
  liveKinds?: ChatGameKind[]
  onClose: () => void
}) {
  const create = useCreateChatGame(conversationId)

  async function pick(kind: ChatGameKind, initialState: unknown) {
    try {
      await create.mutateAsync({ kind, state: initialState })
      onClose()
    } catch {
      // The error surfaces below; the sheet stays open so they can retry.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-label="Pick a game"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-5 max-h-[80vh] overflow-y-auto no-scrollbar"
        style={{ paddingBottom: 'calc(1.25rem + var(--lm-bottom-inset))' }}
      >
        <div className="text-center mb-4">
          <h2 className="text-base font-extrabold text-ink">Play something</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Take your turn whenever. They'll get a nudge each time you move.
          </p>
        </div>

        <ul className="space-y-1.5">
          {GAMES.map((g) => {
            const live = !!liveKinds?.includes(g.kind)
            return (
              <li key={g.kind}>
                <button
                  onClick={() => (live ? onClose() : pick(g.kind, g.initialState()))}
                  disabled={create.isPending}
                  className="w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06] disabled:opacity-60 transition-colors"
                >
                  <span className="w-10 h-10 rounded-full bg-white/8 grid place-items-center text-xl shrink-0">
                    {g.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{g.name}</span>
                    <span className="block text-xs text-ink-muted truncate">{g.blurb}</span>
                  </span>
                  {live && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gold">
                      In progress
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {create.error && (
          <p className="mt-3 text-xs text-danger text-center">{errMessage(create.error)}</p>
        )}
      </motion.div>
    </motion.div>
  )
}
