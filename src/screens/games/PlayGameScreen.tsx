import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import {
  useGameByCode,
  useGamePlayers,
  useJoinGame,
  useStartGame,
  useGameRound,
  useSetRoundImage,
  useSubmitSolve,
  useAdvanceRound,
  useReassignTurn,
  useCreateGame,
  useCloseGame,
  useLeaveGame,
  playerLabel,
  type GamePlayer,
  type Game,
} from '../../hooks/usePixelGame'
import { useUploadChatMedia } from '../../hooks/useUploadChatMedia'
import { useGamePresence } from '../../hooks/useGamePresence'
import { useGameBroadcast } from '../../hooks/useGameBroadcast'
import PixelBoard, { MiniBoard, seedFor, scrambleFor, solvedCount, gridForRound, difficultyLabel } from '../../components/games/PixelBoard'
import { avatarUrlOr } from '../../lib/avatar'
import ShareSheet from '../../components/ShareSheet'

/**
 * Public game route (/play/:code). Works for the host, invited members, and
 * account-less guests (signed in anonymously). Shows the lobby, lets people
 * join, and the host start. Match play builds on this next.
 */
export default function PlayGameScreen() {
  const { code } = useParams<{ code: string }>()
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)

  // Account-less guests get an anonymous session so they can join via RLS.
  const [anonError, setAnonError] = useState<string | null>(null)
  useEffect(() => {
    if (ready && !session) {
      supabase.auth.signInAnonymously().catch((e) =>
        setAnonError((e as Error).message || 'Could not start a guest session.'),
      )
    }
  }, [ready, session])

  const navigate = useNavigate()
  const game = useGameByCode(code)
  const players = useGamePlayers(game.data?.id)
  const join = useJoinGame()
  const start = useStartGame()
  const closeGame = useCloseGame()
  const leaveGame = useLeaveGame()
  const online = useGamePresence(game.data?.id, session?.user.id ?? null)

  const [name, setName] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const myId = session?.user.id ?? null
  const isAnon = !!session?.user.is_anonymous
  const list = players.data ?? []
  const me = list.find((p) => p.user_id === myId)
  const inGame = !!me
  const isHost = !!me?.is_host
  const g = game.data
  const inviteUrl = g ? `${window.location.origin}/play/${g.invite_code}` : ''
  const shareText = `Join my Pixel Rush game on Love meet 🧩 ${inviteUrl}`
  const playerIds = new Set(list.map((p) => p.user_id))
  const viewers = [...online].filter((id) => !playerIds.has(id)).length

  async function doClose() {
    if (!g) return
    if (!window.confirm('Close this game for everyone?')) return
    try { await closeGame.mutateAsync(g.id); navigate('/games') }
    catch (e) { alert((e as Error).message) }
  }

  async function doLeave() {
    if (!g) return
    if (!window.confirm('Leave this game?')) return
    try { await leaveGame.mutateAsync(g.id) } catch { /* ignore */ }
    navigate('/')
  }

  async function doJoin() {
    if (!code) return
    setJoinError(null)
    try {
      await join.mutateAsync({ code, guestName: isAnon ? name.trim() : null })
    } catch (e) {
      setJoinError((e as Error).message)
    }
  }

  // ----- loading / error states -----
  if (!ready || (!session && !anonError)) return <Frame><Spinner /></Frame>
  if (anonError) return <Frame><Center icon="🚪" title="Couldn't join as guest" sub={anonError} /></Frame>
  if (game.isPending) return <Frame><Spinner /></Frame>
  if (!g) return <Frame><Center icon="🔍" title="Game not found" sub="This invite link is invalid or the game was removed." /></Frame>

  // ----- not yet joined → join card -----
  if (!inGame && g.status === 'lobby') {
    return (
      <Frame>
        <Card>
          <h1 className="text-xl font-extrabold text-gradient-warm">🧩 Pixel Rush</h1>
          <p className="text-sm text-ink-2 mt-1">You've been invited to a {g.kind === '1v1' ? '1 v 1' : 'group'} match.</p>
          {isAnon && (
            <label className="block mt-4">
              <div className="text-xs font-bold text-ink-2 mb-1.5">What should we call you?</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={24}
                className="lm-input"
                autoFocus
              />
            </label>
          )}
          {joinError && <p className="text-xs text-danger mt-2">{joinError}</p>}
          <button
            onClick={doJoin}
            disabled={join.isPending || (isAnon && name.trim().length < 2)}
            className="mt-4 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60"
          >
            {join.isPending ? 'Joining…' : 'Join game'}
          </button>
          {isAnon && (
            <p className="mt-3 text-[11px] text-ink-muted text-center">
              Playing as a guest. <Link to="/" className="text-rose font-semibold">Create an account</Link> to save your wins.
            </p>
          )}
        </Card>
      </Frame>
    )
  }

  // ----- active / finished -----
  if (g.status === 'active' || g.status === 'finished') {
    return <Match g={g} players={list} myId={myId} online={online} viewers={viewers} onClose={doClose} onLeave={doLeave} />
  }

  // ----- lobby -----
  const canStart = isHost && list.length >= 2
  return (
    <Frame>
      <Card>
        <h1 className="text-xl font-extrabold text-gradient-warm">🧩 Pixel Rush lobby</h1>
        <p className="text-sm text-ink-2 mt-1">
          {g.kind === '1v1' ? '1 v 1 match' : `Group match · up to ${g.max_players} players`}
        </p>

        {/* Invite */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold mb-1">Invite link</div>
          <button
            onClick={() => navigator.clipboard?.writeText(inviteUrl)}
            className="w-full glass rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-mono text-ink-2 truncate">{inviteUrl}</span>
            <span className="text-ink-muted shrink-0">⧉</span>
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="mt-2 w-full rounded-full py-2.5 text-sm font-bold bg-gradient-brand text-white glow-rose"
          >
            ↗ Share invite (chat &amp; Telegram)
          </button>
          <p className="text-[11px] text-ink-muted mt-1">Anyone with the link can join — no account needed.</p>
        </div>

        <PlayerList players={list} kind={g.kind} online={online} />
        {viewers > 0 && <p className="mt-2 text-[11px] text-ink-muted">👁 {viewers} watching</p>}

        {isHost ? (
          <>
            <button
              onClick={() => g && start.mutate(g.id)}
              disabled={!canStart || start.isPending}
              className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60"
            >
              {start.isPending ? 'Starting…' : canStart ? 'Start game' : 'Waiting for players…'}
            </button>
            <button onClick={doClose} disabled={closeGame.isPending} className="mt-2 w-full rounded-full py-2.5 text-sm font-semibold glass text-ink-2 hover:text-danger">
              Close game
            </button>
          </>
        ) : (
          <p className="mt-5 text-center text-sm text-ink-muted">Waiting for the host to start…</p>
        )}
        {start.error && <p className="text-xs text-danger mt-2 text-center">{(start.error as Error).message}</p>}
      </Card>

      {shareOpen && <ShareSheet url={inviteUrl} text={shareText} title="Invite to Pixel Rush" onClose={() => setShareOpen(false)} />}
    </Frame>
  )
}

function PlayerList({ players, kind, online }: { players: GamePlayer[]; kind: string; online: Set<string> }) {
  const teamA = players.filter((p) => p.team === 'A')
  const teamB = players.filter((p) => p.team === 'B')
  return (
    <div className="mt-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold mb-2">
        Players ({players.length})
      </div>
      {kind === 'group' ? (
        <div className="grid grid-cols-2 gap-3">
          <TeamCol label="Team A" players={teamA} online={online} />
          <TeamCol label="Team B" players={teamB} online={online} />
        </div>
      ) : (
        <ul className="space-y-2">{players.map((p) => <PlayerRow key={p.id} p={p} online={online.has(p.user_id)} />)}</ul>
      )}
    </div>
  )
}

function TeamCol({ label, players, online }: { label: string; players: GamePlayer[]; online: Set<string> }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="text-[11px] font-bold text-rose mb-2">{label}</div>
      <ul className="space-y-2">{players.map((p) => <PlayerRow key={p.id} p={p} online={online.has(p.user_id)} />)}</ul>
      {players.length === 0 && <p className="text-[11px] text-ink-muted">—</p>}
    </div>
  )
}

function PlayerRow({ p, online }: { p: GamePlayer; online: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className="relative shrink-0">
        <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-7 h-7 rounded-full object-cover" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-2 ${online ? 'bg-success' : 'bg-ink-muted'}`}
          aria-label={online ? 'online' : 'offline'}
        />
      </span>
      <span className="text-sm text-ink truncate">{playerLabel(p)}</span>
      {p.is_host && <span className="text-[9px] font-bold uppercase tracking-wider text-gold">host</span>}
      {!online && <span className="text-[10px] text-ink-muted">left</span>}
    </li>
  )
}

// ---------- Match (active / finished) ----------
function Match({ g, players, myId, online, viewers, onClose, onLeave }: {
  g: Game; players: GamePlayer[]; myId: string | null; online: Set<string>; viewers: number; onClose: () => void; onLeave: () => void
}) {
  const navigate = useNavigate()
  const round = useGameRound(g.id, g.current_round)
  const setImg = useSetRoundImage()
  const submit = useSubmitSolve()
  const advance = useAdvanceRound()
  const reassign = useReassignTurn()
  const createGame = useCreateGame()
  const upload = useUploadChatMedia()
  const { progress, sendProgress } = useGameBroadcast(g.id)
  // My own board order — broadcast is self:false, so my % is computed locally.
  const [myOrder, setMyOrder] = useState<number[] | null>(null)
  // Reset my tracked progress whenever the round changes.
  useEffect(() => { setMyOrder(null) }, [g.current_round])

  async function rematch() {
    try {
      const ng = await createGame.mutateAsync({ kind: g.kind, maxPlayers: g.max_players })
      navigate(`/play/${ng.invite_code}`)
    } catch { /* shown via state */ }
  }

  const me = players.find((p) => p.user_id === myId)
  const amPlayer = !!me
  const isHost = !!me?.is_host
  const r = round.data

  async function pickRoundImage(file: File | undefined) {
    if (!file || !r) return
    try {
      const up = await upload.mutateAsync(file)
      await setImg.mutateAsync({ gameId: g.id, round: r.round_no, imageUrl: up.url })
    } catch { /* shown via mutation state */ }
  }

  // ----- Finished — "Game over", with a winner if there was one. -----
  if (g.status === 'finished') {
    const hasWinner = !!(g.winner_player || g.winner_team)
    const champ = players.find((p) => p.user_id === g.winner_player)
    return (
      <Frame>
        <Card>
          <div className="text-center">
            <div className="text-6xl">{hasWinner ? '🏆' : '🏁'}</div>
            <h1 className="mt-2 text-2xl font-extrabold text-gradient-warm">
              {hasWinner
                ? (g.kind === '1v1' ? `${champ ? playerLabel(champ) : 'Someone'} wins!` : `Team ${g.winner_team} wins!`)
                : 'Game over'}
            </h1>
            {!hasWinner && <p className="text-sm text-ink-2 mt-1">The game has ended.</p>}
          </div>
          <Scoreboard players={players} kind={g.kind} online={online} />
          <div className="mt-5 flex flex-col gap-2">
            {isHost && (
              <button onClick={rematch} disabled={createGame.isPending} className="w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60">
                {createGame.isPending ? '…' : 'Rematch'}
              </button>
            )}
            <button onClick={() => navigate('/games')} className="w-full rounded-full py-3 glass text-ink-2 hover:text-ink font-semibold">
              Back to games
            </button>
          </div>
        </Card>
      </Frame>
    )
  }

  const turnPlayer = players.find((p) => p.user_id === r?.turn_user_id)
  const winner = players.find((p) => p.user_id === r?.winner_player)

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* Fixed VS header — opponents + scores + close/leave. */}
      <div className="fixed top-0 left-0 right-0 z-20 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-md mx-auto px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-ink-2">Round {g.current_round}/{g.rounds_total}</span>
            <div className="flex items-center gap-3">
              {viewers > 0 && <span className="text-[11px] text-ink-muted">👁 {viewers}</span>}
              {isHost ? (
                <button onClick={onClose} className="text-[11px] font-bold text-ink-muted hover:text-danger">Close</button>
              ) : amPlayer ? (
                <button onClick={onLeave} className="text-[11px] font-bold text-ink-muted hover:text-danger">Leave</button>
              ) : (
                <button onClick={() => navigate('/feed')} className="text-[11px] font-bold text-ink-muted hover:text-ink">Exit</button>
              )}
            </div>
          </div>
          <VSHeader players={players} kind={g.kind} online={online} />
        </div>
      </div>

      {/* Content (clears the fixed header). */}
      <div className="max-w-md mx-auto px-4" style={{ paddingTop: 'calc(var(--lm-top-inset) + 6.5rem)', paddingBottom: '3rem' }}>
        {!r || round.isPending ? (
          <Spinner />
        ) : r.status === 'awaiting_image' ? (
          r.turn_user_id === myId ? (
            <div className="text-center py-8">
              <p className="text-sm text-ink-2 mb-3">Your turn — pick a picture for everyone to race.</p>
              <label className="inline-block rounded-full px-6 py-3 bg-gradient-brand text-white font-bold glow-rose cursor-pointer">
                {upload.isPending || setImg.isPending ? 'Uploading…' : 'Upload picture'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickRoundImage(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-ink-muted">
                Waiting for <b className="text-ink">{turnPlayer ? playerLabel(turnPlayer) : 'the next player'}</b> to pick a picture…
                {turnPlayer && !online.has(turnPlayer.user_id) && <span className="block text-danger mt-1">They seem to have left — skip them.</span>}
              </p>
              {isHost && (
                <button onClick={() => reassign.mutate({ gameId: g.id, round: r.round_no })} disabled={reassign.isPending}
                  className="mt-3 text-xs font-bold rounded-full px-4 py-1.5 glass text-ink-2 hover:text-ink disabled:opacity-60">
                  Skip player →
                </button>
              )}
            </div>
          )
        ) : r.status === 'racing' ? (
          amPlayer ? (
            <div>
              {/* Target picture */}
              <div className="text-center mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold mb-1">Rebuild this picture</div>
                <img src={r.image_url!} alt="" className="mx-auto w-24 aspect-square object-cover rounded-xl ring-1 ring-white/10" />
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="rounded-full px-2 py-0.5 glass text-gradient-warm">{difficultyLabel(gridForRound(r.round_no))}</span>
                  <span className="text-ink-muted">{gridForRound(r.round_no)}×{gridForRound(r.round_no)}</span>
                </div>
              </div>
              {/* Draggable grid */}
              <motion.div drag dragMomentum={false} dragElastic={0.12} whileDrag={{ scale: 1.03 }} className="touch-none cursor-grab active:cursor-grabbing">
                <div className="text-center text-[10px] text-ink-muted mb-1">✥ drag to reposition</div>
                <PixelBoard
                  image={r.image_url!}
                  seed={seedFor(g.id, r.round_no)}
                  grid={gridForRound(r.round_no)}
                  startedAt={r.started_at ? Date.parse(r.started_at) : Date.now()}
                  locked={false}
                  onSolve={(timeMs) => submit.mutate({ gameId: g.id, round: r.round_no, timeMs })}
                  onProgress={(order, done) => { setMyOrder(order); if (myId) sendProgress(myId, order, done) }}
                />
              </motion.div>
              {/* Live progress — me vs each opponent. */}
              <RaceProgress
                players={players}
                myId={myId}
                myOrder={myOrder}
                progress={progress}
                grid={gridForRound(r.round_no)}
              />
            </div>
          ) : (
            <SpectatorBoards gameId={g.id} round={r.round_no} image={r.image_url!} players={players} progress={progress} />
          )
        ) : (
          // done — round won, waiting to advance
          <div className="text-center py-8">
            <div className="text-4xl">🎉</div>
            <p className="mt-2 font-extrabold text-ink">
              {winner ? (winner.user_id === myId ? 'You won the round!' : `${playerLabel(winner)} won the round`) : 'Round over'}
            </p>
            {r.winner_time_ms != null && <p className="text-sm text-ink-muted">{(r.winner_time_ms / 1000).toFixed(1)}s</p>}
            {isHost ? (
              <button onClick={() => advance.mutate(g.id)} disabled={advance.isPending}
                className="mt-4 rounded-full px-6 py-2.5 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60">
                {advance.isPending ? '…' : g.current_round >= g.rounds_total ? 'Finish game' : 'Next round'}
              </button>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Next round starting…</p>
            )}
          </div>
        )}

        {(submit.error || setImg.error) && (
          <p className="mt-3 text-xs text-danger text-center">{((submit.error || setImg.error) as Error).message}</p>
        )}
      </div>
    </div>
  )
}

/** The opponents bar: A — VS — B with avatars + scores (or team totals). */
function VSHeader({ players, kind, online }: { players: GamePlayer[]; kind: string; online: Set<string> }) {
  if (kind === 'group') {
    const a = players.filter((p) => p.team === 'A').reduce((s, p) => s + p.score, 0)
    const b = players.filter((p) => p.team === 'B').reduce((s, p) => s + p.score, 0)
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center"><div className="text-[11px] text-rose font-bold">Team A</div><div className="text-2xl font-extrabold text-ink">{a}</div></div>
        <span className="text-sm font-extrabold text-gradient-warm px-2">VS</span>
        <div className="flex-1 text-center"><div className="text-[11px] text-rose font-bold">Team B</div><div className="text-2xl font-extrabold text-ink">{b}</div></div>
      </div>
    )
  }
  const a = players[0]
  const b = players[1]
  return (
    <div className="flex items-center justify-between gap-2">
      <PlayerChip p={a} online={!!a && online.has(a.user_id)} align="left" />
      <span className="text-sm font-extrabold text-gradient-warm shrink-0">VS</span>
      <PlayerChip p={b} online={!!b && online.has(b.user_id)} align="right" />
    </div>
  )
}

function PlayerChip({ p, online, align }: { p?: GamePlayer; online: boolean; align: 'left' | 'right' }) {
  if (!p) return <div className="flex-1 text-center text-[11px] text-ink-muted">waiting…</div>
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className="relative shrink-0">
        <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-9 h-9 rounded-full object-cover" />
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-2 ${online ? 'bg-success' : 'bg-ink-muted'}`} />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-ink truncate">{playerLabel(p)}</div>
        <div className="text-lg font-extrabold text-gradient-warm leading-none">{p.score}</div>
      </div>
    </div>
  )
}

/** Live progress for a racing player: their own % plus each opponent's %, so
 *  you can see how close anyone is to finishing. My own order comes in locally
 *  (broadcast is self:false); opponents' orders arrive over the broadcast. */
function RaceProgress({
  players, myId, myOrder, progress, grid,
}: {
  players: GamePlayer[]
  myId: string | null
  myOrder: number[] | null
  progress: Map<string, { order: number[]; done: boolean }>
  grid: number
}) {
  const total = grid * grid
  return (
    <div className="mt-5 space-y-2.5">
      {players.map((p) => {
        const mine = p.user_id === myId
        const order = mine ? myOrder : progress.get(p.user_id)?.order
        const pct = order ? Math.round((solvedCount(order) / total) * 100) : 0
        return (
          <div key={p.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-ink truncate">
                {mine ? 'You' : playerLabel(p)}
              </span>
              <span className="text-[11px] font-bold text-gradient-warm tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className={mine ? 'h-full rounded-full bg-gradient-brand' : 'h-full rounded-full bg-white/40'}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Spectator view of a live race: the target picture + each player's board
 *  updating in real time, with their solved %. */
function SpectatorBoards({
  gameId, round, image, players, progress,
}: {
  gameId: string
  round: number
  image: string
  players: GamePlayer[]
  progress: Map<string, { order: number[]; done: boolean }>
}) {
  const grid = gridForRound(round)
  const start = scrambleFor(gameId, round, grid)
  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold mb-1">Rebuild this picture</div>
        <img src={image} alt="" className="mx-auto w-28 aspect-square object-cover rounded-xl ring-1 ring-white/10" />
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold">
          <span className="rounded-full px-2 py-0.5 glass text-gradient-warm">{difficultyLabel(grid)}</span>
          <span className="text-ink-muted">{grid}×{grid}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {players.map((p) => {
          const order = progress.get(p.user_id)?.order ?? start
          const pct = Math.round((solvedCount(order) / (grid * grid)) * 100)
          return (
            <div key={p.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-ink-2 truncate">{playerLabel(p)}</span>
                <span className="text-[11px] font-bold text-gradient-warm">{pct}%</span>
              </div>
              <MiniBoard image={image} order={order} grid={grid} />
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-muted">🍿 You're watching — only players can play.</p>
    </div>
  )
}

function Scoreboard({ players, kind, online }: { players: GamePlayer[]; kind: string; online: Set<string> }) {
  if (kind === 'group') {
    const a = players.filter((p) => p.team === 'A').reduce((s, p) => s + p.score, 0)
    const b = players.filter((p) => p.team === 'B').reduce((s, p) => s + p.score, 0)
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-3 text-center"><div className="text-[11px] text-rose font-bold">Team A</div><div className="text-2xl font-extrabold text-ink">{a}</div></div>
        <div className="glass rounded-2xl p-3 text-center"><div className="text-[11px] text-rose font-bold">Team B</div><div className="text-2xl font-extrabold text-ink">{b}</div></div>
      </div>
    )
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {[...players].sort((x, y) => y.score - x.score).map((p) => {
        const isOn = online.has(p.user_id)
        return (
          <li key={p.id} className="flex items-center justify-between glass rounded-xl px-3 py-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="relative shrink-0">
                <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-surface-2 ${isOn ? 'bg-success' : 'bg-ink-muted'}`} />
              </span>
              <span className="text-sm text-ink truncate">{playerLabel(p)}</span>
              {!isOn && <span className="text-[10px] text-ink-muted">left</span>}
            </span>
            <span className="text-sm font-extrabold text-gradient-warm">{p.score}</span>
          </li>
        )
      })}
    </ul>
  )
}

// ---- layout bits ----
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink grid place-items-center px-5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6">
      {children}
    </motion.div>
  )
}
function Spinner() {
  return <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin mx-auto" />
}
function Center({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-2">{icon}</div>
      <h1 className="text-lg font-extrabold text-ink">{title}</h1>
      <p className="text-sm text-ink-muted mt-1">{sub}</p>
      <Link to="/" className="mt-4 inline-block text-rose font-semibold">← Go to Love meet</Link>
    </div>
  )
}
