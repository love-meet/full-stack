import { useState, type ComponentType } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../stores/auth'
import {
  chatGamesKey,
  useMyRole,
  usePlayChatMove,
  useRespondChatGame,
  useResignChatGame,
  isStaleLike,
  type ChatGame,
  type ChatGameStatus,
} from '../../hooks/useChatGames'
import { gameFor } from '../../lib/games'
import type { BoardProps, MoveResult, Outcome } from '../../lib/games/types'

const DISMISSED_KEY = 'lm:dismissed-games'
const MAX_DISMISSED = 50

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? (arr as string[]) : []
  } catch {
    return []
  }
}

/** Exported for G5 (the live-games strip in `ChatDetailScreen.tsx`), which
 *  needs to filter dismissed games out of its own list without duplicating
 *  the `localStorage` key and parsing here (that would drift). The key
 *  itself (`DISMISSED_KEY`) stays private to this module. */
// eslint-disable-next-line react-refresh/only-export-components -- plain helper, not a component; ChatGameCard's own fast refresh is unaffected.
export function isDismissed(id: string): boolean {
  return readDismissed().includes(id)
}

/** Marks a game as locally closed. Capped at 50 so the list never grows
 *  without bound (D14). Silently gives up if storage is unavailable
 *  (private mode, quota) — the card still self-hides for this session. */
function dismissGame(id: string): void {
  try {
    const ids = readDismissed().filter((x) => x !== id)
    ids.push(id)
    while (ids.length > MAX_DISMISSED) ids.shift()
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // best effort only
  }
}

/**
 * postgrest-js hands back a plain `{ message, code, details, hint }` object
 * for RPC failures, not an `Error` instance — see the note on
 * `isStaleLike` in `useChatGames.ts`. Duck-type the message the same way.
 */
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'Something went wrong.'
}

type NoticeKind = 'stale' | 'saved' | 'action' | 'error'
/** `at`/`status` are the `move_count`/`status` the notice should stay
 *  readable through: stamped from the FRESH row after the recovery
 *  refetch (not the stale closure the error was raised in — see
 *  `handleError`), so the redraw that follows a stale rejection doesn't
 *  blank the one message that recovery exists to show. Cleared when
 *  either changes (Plan §4.3: move_count OR status). */
type Notice = { kind: NoticeKind; text: string; at: number; status: ChatGameStatus }

const NOTICE_CLASS: Record<NoticeKind, string> = {
  stale: 'text-ink-muted',
  saved: 'text-gold',
  action: 'text-ink-muted',
  error: 'text-danger',
}

/**
 * One game, inline in the conversation (§8).
 *
 * No lobby and no spectators — if you can see this card you are one of the
 * two players. No presence either: the card says whose turn it is, never who
 * is online.
 *
 * THIS COMPONENT OWNS ALL ERROR AND STALE UX (plan §4, D9). Boards never
 * render error text; they either resolve `onMove`'s promise `false` or call
 * `onError`, and every one of those funnels into `handleError` below, which
 * is the single place a notice gets decided and drawn. Three distinct
 * situations reach it and must read differently on screen:
 *
 *   (a) a normal stale move — `onMove`'s `play.mutateAsync` rejected with a
 *       stale-like message (`stale_move` / `not your turn` /
 *       `game is not active` / `already guessed`). Normal in async
 *       turn-based play, not an error: "They moved first — here's the new
 *       board." (`kind: 'stale'`).
 *   (b) a failed move where the board passed `opts.secretSaved: true` — a
 *       0095 secret RPC already durably committed (a word, a number, a
 *       throw) before `onMove` was even called, and that write cannot be
 *       undone or resent. Always "Saved — tap again to send.", regardless
 *       of what the underlying error was (`kind: 'saved'`) — never the
 *       stale copy, never a generic error, because the fix here is
 *       "press the button again from the frozen local value", not
 *       "re-read the board".
 *   (c) a direct secret-RPC failure reported through `onError` (a board
 *       calling `setGameSecret` / `guessWordLetter` / `guessDuelNumber` /
 *       `revealRpsThrows` / `clearGameSecrets` outside of `onMove`). These
 *       get their own `kind: 'action'` copy — even when the cause is
 *       stale-like, the wording is deliberately different from (a) because
 *       nothing was submitted as a move; the state simply moved out from
 *       under the read/write the board attempted.
 */
export default function ChatGameCard({
  game,
  onDismissed,
}: {
  game: ChatGame
  /** Fired after this card dismisses itself — i.e. after the `localStorage`
   *  write inside `close()`, for every path that leads there (the finished
   *  Close button and Withdraw, which calls `close()` only once `resign`
   *  resolves). This is the explicit signal `ChatDetailScreen` needs to
   *  re-run its `isDismissed` filter — inferring "a dismissal happened"
   *  from "a click happened somewhere in the strip" doesn't work for
   *  Withdraw, since its `close()` runs well after the originating click,
   *  once the mutation's own invalidate has already landed. */
  onDismissed?: () => void
}) {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const myRole = useMyRole(game)
  const def = gameFor(game.kind)
  const play = usePlayChatMove(game.conversation_id)
  const respond = useRespondChatGame(game.conversation_id)
  const resign = useResignChatGame(game.conversation_id)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [closed, setClosed] = useState(() => isDismissed(game.id))

  if (!def || !myRole || closed) return null

  const finished = game.status === 'finished'
  const isMyTurn = game.turn_user_id === myId && game.status === 'active'
  const outcome: Outcome = !finished
    ? null
    : game.is_draw
      ? 'draw'
      : game.winner_user_id === myId
        ? 'won'
        : 'lost'

  /**
   * Single funnel for every failure a board or `onMove` can report (§4).
   *
   * FINDING 1 fix: `at`/`status` must NOT be stamped from `game` (this
   * render's closure) — that's the PRE-move row. The invalidate below
   * refetches, and the fresh row lands with a DIFFERENT `move_count` (and
   * possibly `status`); stamping from the stale closure would make the
   * visibility check (`notice.at === game.move_count`) fail the instant the
   * redraw happens, hiding the one message stale-recovery exists to show —
   * or, if realtime's own invalidate wins the race, hide it before it ever
   * renders. So: await the invalidate/refetch, then read the FRESH row back
   * out of the cache and stamp from that (falling back to the pre-move
   * values only if the row is somehow gone, e.g. it fell outside the
   * 20-row/status window).
   */
  async function handleError(e: unknown, opts?: { secretSaved?: boolean; fromAction?: boolean }) {
    // Direct secret-RPC calls (`onError`) don't ride a mutation that
    // invalidates on its own error — `usePlayChatMove` does that for the
    // `onMove` path, but this makes recovery independent of which path
    // fired, matching §4 point 1.
    await qc.invalidateQueries({ queryKey: chatGamesKey(game.conversation_id) })
    const fresh = qc.getQueryData<ChatGame[]>(chatGamesKey(game.conversation_id))
    const freshGame = fresh?.find((g) => g.id === game.id)
    const at = freshGame?.move_count ?? game.move_count
    const status = freshGame?.status ?? game.status

    if (opts?.secretSaved) {
      setNotice({ kind: 'saved', text: 'Saved — tap again to send.', at, status })
      return
    }
    if (opts?.fromAction) {
      setNotice({
        kind: 'action',
        text: isStaleLike(e)
          ? 'That changed while you were doing that — here’s the latest board.'
          : errMessage(e),
        at,
        status,
      })
      return
    }
    setNotice(
      isStaleLike(e)
        ? { kind: 'stale', text: 'They moved first — here’s the new board.', at, status }
        : { kind: 'error', text: errMessage(e), at, status },
    )
  }

  async function onMove(
    result: MoveResult<unknown>,
    opts?: { secretSaved?: boolean },
  ): Promise<boolean> {
    setNotice(null)
    try {
      await play.mutateAsync({ gameId: game.id, expectedMove: game.move_count, result })
      return true
    } catch (e) {
      await handleError(e, opts)
      return false
    }
  }

  async function onError(e: unknown) {
    await handleError(e, { fromAction: true })
  }

  function close() {
    dismissGame(game.id)
    setClosed(true)
    onDismissed?.()
  }

  async function withdraw() {
    let r: ChatGame
    try {
      r = await resign.mutateAsync(game.id)
    } catch {
      // Best effort — if it failed the row is still `invited`, so the card
      // just keeps showing "Invite sent" and Withdraw can be tapped again.
      return
    }
    // `resign_chat_game` (0114) can race the invitee's accept: if
    // `respond_chat_game(true)` committed first, the row was already
    // `active` by the time this ran, so the RPC took the forfeit branch
    // instead of withdrawing the invite — `r.status` comes back `finished`,
    // not `declined`, and `r.winner_user_id` is the invitee. That is a real
    // loss, not a cancelled invite, so only dismiss on an actual withdraw;
    // a `finished` result stays on screen so the normal finished-card path
    // (board + outcome text + Close button) renders it like any other
    // resignation.
    if (r.status !== 'declined') {
      setNotice({
        kind: 'action',
        text: 'They’d already accepted when your withdrawal landed — it counted as a resignation.',
        at: r.move_count,
        status: r.status,
      })
      return
    }
    close()
  }

  // ── Invite, not yet answered ──
  if (game.status === 'invited') {
    const mine = game.player_a === myId
    return (
      <Shell def={def}>
        {mine ? (
          <>
            <p className="text-sm text-ink-2">Invite sent. Waiting for them to accept.</p>
            {resign.error && (
              <p className="mt-2 text-center text-xs text-danger">{errMessage(resign.error)}</p>
            )}
            <div className="mt-3 text-center">
              <button
                onClick={withdraw}
                disabled={resign.isPending}
                className="text-xs text-ink-muted hover:text-danger disabled:opacity-60"
              >
                Withdraw
              </button>
            </div>
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

  const BoardComponent = def.Board as unknown as ComponentType<BoardProps<unknown>>
  const busy = play.isPending || respond.isPending || resign.isPending

  return (
    <Shell def={def}>
      <BoardComponent
        key={`${game.id}:${game.move_count}`}
        gameId={game.id}
        state={game.state}
        myRole={myRole}
        isMyTurn={isMyTurn}
        finished={finished}
        outcome={outcome}
        busy={busy}
        onMove={onMove}
        onError={onError}
      />

      <p
        className={[
          'mt-3 text-center text-sm font-semibold',
          outcome === 'won' ? 'text-success' : outcome === 'lost' ? 'text-ink-muted' : 'text-ink-2',
        ].join(' ')}
      >
        {def.status(game.state as never, myRole, isMyTurn, outcome)}
      </p>

      {notice && notice.at === game.move_count && notice.status === game.status && (
        <p className={['mt-2 text-center text-xs', NOTICE_CLASS[notice.kind]].join(' ')}>
          {notice.text}
        </p>
      )}

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

      {finished && (
        <div className="mt-3 text-center">
          <button onClick={close} className="text-xs text-ink-muted hover:text-ink">
            Close
          </button>
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
