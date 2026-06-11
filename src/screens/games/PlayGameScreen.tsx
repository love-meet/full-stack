import { useEffect, useMemo, useState } from 'react'
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
  useAutoAdvanceRound,
  useReassignTurn,
  useRequestRematch,
  useCloseGame,
  useLeaveGame,
  playerLabel,
  isNetworkError,
  gamePlayersKey,
  type GamePlayer,
  type Game,
} from '../../hooks/usePixelGame'
import { useQueryClient } from '@tanstack/react-query'
import { useOnline } from '../../hooks/useOnline'
import { useUploadChatMedia } from '../../hooks/useUploadChatMedia'
import { useGamePresence } from '../../hooks/useGamePresence'
import { useGameBroadcast } from '../../hooks/useGameBroadcast'
import { useConversations } from '../../hooks/useConversations'
import { useLiveReactions } from '../../hooks/useLiveReactions'
import { useProfile } from '../../hooks/useProfile'
import LiveOverlay from '../../components/games/LiveOverlay'
import { IconMail } from '../../components/icons'
import TopIcons from '../../shell/TopIcons'
import { InlineAd, PopunderAd } from '../../components/FeedAd'
import DuelArena from '../../components/games/NumberDuelMatch'
import DraughtsBoard from '../../components/games/DraughtsBoard'
import { useDraughtsRound, useAdvanceDraughts } from '../../hooks/useDraughts'
import { MiniBoard, seedFor, scrambleFor, solvedCount, gridForRound, difficultyLabel } from '../../components/games/PixelBoard'
import PixelRushCanvas from '../../games/pixel-rush/PixelRushCanvas'
import PixelRushLobby from '../../games/pixel-rush/PixelRushLobby'
import PixelRushHUDCanvas from '../../games/pixel-rush/PixelRushHUDCanvas'
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
  // We race the call against a 10s timeout — if it stalls (network, blocked
  // endpoint, or the Supabase project has anonymous sign-ins disabled and
  // hangs instead of erroring), the user gets an actionable message instead
  // of an infinite spinner on the invite link.
  const [anonError, setAnonError] = useState<string | null>(null)
  useEffect(() => {
    if (!ready || session) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (!cancelled) setAnonError(
        "Couldn't start a guest session. Refresh the page and try again, or sign in to join the game.",
      )
    }, 10000)
    supabase.auth.signInAnonymously()
      .then(({ error }) => {
        if (cancelled) return
        window.clearTimeout(timeout)
        if (error) setAnonError(error.message || 'Could not start a guest session.')
      })
      .catch((e) => {
        if (cancelled) return
        window.clearTimeout(timeout)
        setAnonError((e as Error).message || 'Could not start a guest session.')
      })
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [ready, session])

  const navigate = useNavigate()
  const qc = useQueryClient()
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

  // Stall counter for the host-alone lobby. Tick every second while in a
  // lobby; at 3 minutes, auto-close. The server's sweep is a safety net.
  // lobby_since resets when a mid-game stall reverts the game to lobby,
  // so a reverted game gets a fresh 3-min window to find an opponent.
  const [lobbyElapsedSec, setLobbyElapsedSec] = useState(0)
  useEffect(() => {
    if (!g || g.status !== 'lobby') return
    const start = new Date(g.lobby_since ?? g.created_at).getTime()
    const tick = () => setLobbyElapsedSec(Math.floor((Date.now() - start) / 1000))
    tick()
    const iv = window.setInterval(tick, 1000)
    return () => window.clearInterval(iv)
  }, [g?.id, g?.status, g?.lobby_since])
  useEffect(() => {
    const hostAlone = !!g && g.status === 'lobby' && isHost && list.length <= 1
    if (hostAlone && lobbyElapsedSec >= 180 && !closeGame.isPending) {
      closeGame.mutate(g!.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyElapsedSec, isHost, list.length, g?.status])
  const playerIds = new Set(list.map((p) => p.user_id))
  const viewers = [...online].filter((id) => !playerIds.has(id)).length

  // window.confirm renders BEHIND the canvas in Telegram Mini App fullscreen
  // mode, so taps appear to do nothing. Use Telegram's native showConfirm
  // when available — it floats above everything.
  function confirmPrompt(message: string): Promise<boolean> {
    const wa = window.Telegram?.WebApp
    if (wa?.showConfirm) {
      return new Promise<boolean>((resolve) => {
        wa.showConfirm!(message, (ok: boolean) => resolve(!!ok))
      })
    }
    return Promise.resolve(window.confirm(message))
  }

  async function doClose() {
    if (!g) return
    if (!(await confirmPrompt('Close this game for everyone?'))) return
    try { await closeGame.mutateAsync(g.id); navigate('/games') }
    catch (e) { alert((e as Error).message) }
  }

  async function doLeave() {
    if (!g) return
    if (!(await confirmPrompt('Leave this game?'))) return
    try {
      await leaveGame.mutateAsync(g.id)
      // Optimistically drop ourselves from the players cache so the host's
      // realtime sub isn't the only thing the UI relies on for "they left".
      qc.setQueryData(gamePlayersKey(g.id), (prev: GamePlayer[] | undefined) =>
        (prev ?? []).filter((p) => p.user_id !== myId))
    } catch (e) {
      // Surface the failure instead of silently swallowing — without this,
      // the leaver navigates away thinking they've left while their row is
      // still alive server-side and the host still sees them.
      alert(`Could not leave: ${(e as Error).message}`)
      return
    }
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
  // Someone clicked the invite AFTER the match was over and they were never
  // a player → show a clean "ended Xh ago" message instead of the winner
  // scoreboard a participant would see.
  if (g.status === 'finished' && !inGame) {
    const when = g.finished_at ?? g.created_at
    return (
      <Frame>
        <Center
          icon="🏁"
          title={`This game ${endedPhrase(when)}`}
          sub="Ask the host for a fresh invite link to their next match."
        />
      </Frame>
    )
  }

  // ----- not yet joined → join card -----
  if (!inGame && g.status === 'lobby') {
    // Pixel Rush: render the same themed canvas lobby as the host sees, but
    // in `joiner` mode — the inviter is in the left avatar slot, the right
    // slot stays as the "?" placeholder until the local user taps JOIN. The
    // primary button reads JOIN GAME and the close button reads DECLINE.
    if (g.game_type === 'pixel_rush') {
      const hostPlayer = list.find((p) => p.is_host) ?? list[0]
      const primaryDisabled = join.isPending || (isAnon && name.trim().length < 2)
      return (
        <PixelRushLobby
          inviteCode={g.invite_code}
          inviteUrl={inviteUrl}
          host={{
            name: hostPlayer ? playerLabel(hostPlayer) : 'Host',
            avatarUrl: avatarUrlOr(hostPlayer?.profile?.avatar_url),
          }}
          joiner={null}
          isHost={false}
          mode="joiner"
          primaryDisabled={primaryDisabled}
          onPrimaryClick={doJoin}
          onShareClick={() => { /* joiners don't share */ }}
          onCloseClick={() => navigate('/games')}
          nameInput={
            isAnon
              ? {
                  value: name,
                  onChange: setName,
                  placeholder: 'Your name',
                  error: joinError ?? undefined,
                }
              : undefined
          }
        />
      )
    }

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
  // A 1v1 only needs the one opponent — once they're in, stop inviting.
  const lobbyFull = g.kind === '1v1' && list.length >= 2
  const opponent = g.kind === '1v1' ? list.find((p) => p.user_id !== myId) : undefined
  // Stall-handling: every second, recompute how long the host has been alone.
  // At 3 min with no joiners we auto-close the lobby (the server sweep is a
  // belt-and-braces safety net).
  const elapsedSec = lobbyElapsedSec
  const stalling = isHost && list.length <= 1 && g.status === 'lobby' && elapsedSec >= 30
  // The server bumps lobby_since when a stalled match reverts to lobby, so
  // we can detect "your previous opponent left" and tell the host.
  const wasReverted =
    new Date(g.lobby_since ?? g.created_at).getTime() > new Date(g.created_at).getTime() + 5000

  // Pixel Rush gets a fully canvas-based lobby — themed Pixel Rush
  // background, avatar slots in the top corners, INVITE A FRIEND canvas
  // button, 3-2-1 countdown when the opponent joins. The DOM lobby below
  // is kept for the other game types until they're migrated to canvas too.
  if (g.game_type === 'pixel_rush') {
    const hostPlayer = list.find((p) => p.is_host) ?? list[0]
    const joinerPlayer = list.find(
      (p) => !p.is_host && p.user_id !== hostPlayer?.user_id,
    )
    return (
      <>
        <PixelRushLobby
          inviteCode={g.invite_code}
          inviteUrl={inviteUrl}
          host={{
            name: hostPlayer ? playerLabel(hostPlayer) : 'Host',
            avatarUrl: avatarUrlOr(hostPlayer?.profile?.avatar_url),
          }}
          joiner={
            joinerPlayer
              ? {
                  name: playerLabel(joinerPlayer),
                  avatarUrl: avatarUrlOr(joinerPlayer?.profile?.avatar_url),
                }
              : null
          }
          isHost={isHost}
          onShareClick={() => setShareOpen(true)}
          onCloseClick={doClose}
          onAutoStart={isHost ? () => g && start.mutate(g.id) : undefined}
          revertedFromMatch={wasReverted}
        />
        {shareOpen && (
          <ShareSheet
            url={inviteUrl}
            text={shareText}
            title="Invite to Pixel Rush"
            onClose={() => setShareOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <Frame>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-extrabold text-gradient-warm">🧩 Pixel Rush lobby</h1>
          <div className="-mr-2 -mt-1"><TopIcons /></div>
        </div>
        <p className="text-sm text-ink-2 mt-1">
          {g.kind === '1v1' ? '1 v 1 match' : `Group match · up to ${g.max_players} players`}
        </p>

        {/* Opponent walked away mid-game and we're back in the lobby. */}
        {wasReverted && list.length <= 1 && (
          <div className="mt-3 rounded-2xl p-3 bg-rose/10 ring-1 ring-rose/30 text-sm">
            <div className="flex items-start gap-2">
              <span aria-hidden>🚪</span>
              <div className="min-w-0">
                <div className="font-bold text-ink">Your opponent left.</div>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  We've reset the match — invite someone new and pick up where you left off.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stall reminder + auto-close countdown (host alone, lobby idle ≥ 30s). */}
        {stalling && (
          <div className="mt-3 rounded-2xl p-3 bg-gold/10 ring-1 ring-gold/30 text-sm text-ink-2">
            <div className="flex items-start gap-2">
              <span aria-hidden>⏰</span>
              <div className="min-w-0">
                <div className="font-bold text-ink">Still waiting — share the link!</div>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  {elapsedSec >= 150
                    ? `Auto-closing in ${180 - elapsedSec}s if no one joins.`
                    : `${elapsedSec}s with no joiners. Closes automatically at 3 min.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Invite — hidden once a 1v1 has its opponent. */}
        {lobbyFull ? (
          <div className="mt-4 rounded-2xl p-3 bg-success/10 ring-1 ring-success/30 flex items-center gap-3">
            <span className="relative shrink-0">
              <img src={avatarUrlOr(opponent?.profile?.avatar_url)} alt="" className="w-10 h-10 rounded-full object-cover" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success ring-2 ring-surface-2 grid place-items-center text-[9px] text-white">✓</span>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink truncate">{opponent ? `${playerLabel(opponent)} joined!` : 'Opponent joined!'}</div>
              <div className="text-[12px] text-ink-2">{isHost ? 'Both players are in — start when ready.' : 'Waiting for the host to start…'}</div>
            </div>
          </div>
        ) : (
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
        )}

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
  const autoAdvance = useAutoAdvanceRound()
  const reassign = useReassignTurn()
  const rematchVote = useRequestRematch()
  const upload = useUploadChatMedia()
  const { progress, sendProgress } = useGameBroadcast(g.id)
  const live = useLiveReactions(g.id)
  const myProfile = useProfile()
  const isOnline = useOnline()
  // My own board order — broadcast is self:false, so my % is computed locally.
  const [myOrder, setMyOrder] = useState<number[] | null>(null)
  // Reset my tracked progress whenever the round changes.
  useEffect(() => { setMyOrder(null) }, [g.current_round])

  const me = players.find((p) => p.user_id === myId)
  const amPlayer = !!me
  const isHost = !!me?.is_host
  const r = round.data
  // Name shown on this person's live comments: their player name if playing,
  // else their profile handle/name, else a friendly fallback.
  const senderName = (me ? playerLabel(me)
    : myProfile.data?.display_name || myProfile.data?.handle) || 'Viewer'

  // Clear any stale solve/upload error on every round or status transition, so
  // a transient "Load failed" doesn't linger on screen until a manual refresh.
  // (The retry + fastest-time logic resolves the actual outcome regardless.)
  useEffect(() => {
    submit.reset()
    setImg.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.current_round, r?.status])

  // Auto-advance once a round is won — no host click needed. Show the winner
  // briefly, then move on (or finish + show results on the last round). Players
  // drive it; the DB serializes concurrent calls so only one actually advances.
  useEffect(() => {
    if (!amPlayer || g.status !== 'active' || !r || r.status !== 'done') return
    const t = window.setTimeout(() => autoAdvance.mutate({ gameId: g.id, round: r.round_no }), 3500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amPlayer, g.status, g.id, r?.status, r?.round_no])

  async function pickRoundImage(file: File | undefined) {
    if (!file || !r) return
    try {
      const up = await upload.mutateAsync(file)
      await setImg.mutateAsync({ gameId: g.id, round: r.round_no, imageUrl: up.url })
    } catch { /* shown via mutation state */ }
  }

  // ----- Finished — per-viewer "You win/lose", with confetti for the winner. -----
  if (g.status === 'finished') {
    const hasWinner = !!(g.winner_player || g.winner_team)
    const champ = players.find((p) => p.user_id === g.winner_player)
    const iWon = hasWinner && (g.kind === '1v1' ? g.winner_player === myId : !!me?.team && g.winner_team === me.team)
    const iLost = amPlayer && hasWinner && !iWon

    const headline = !hasWinner ? 'Game over'
      : iWon ? 'You win!'
      : iLost ? 'You lose'
      : g.kind === '1v1' ? `${champ ? playerLabel(champ) : 'Someone'} wins!`
      : `Team ${g.winner_team} wins!`
    const icon = !hasWinner ? '🏁' : iWon ? '🏆' : iLost ? '💔' : '🏆'
    const sub = !hasWinner ? 'The game has ended.'
      : iWon ? 'Champion of the picture race! 🎉'
      : iLost ? 'So close — run it back?'
      : 'Final scores below.'

    return (
      <Frame>
        <Card className="relative overflow-hidden text-center">
          {iWon && <Confetti />}
          <motion.div
            initial={{ scale: 0, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 13 }}
            className="relative mx-auto w-24 h-24 grid place-items-center"
          >
            {iWon && (
              <motion.span
                className="absolute inset-0 rounded-full bg-gold/25 blur-xl"
                animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <span className="relative text-7xl drop-shadow">{icon}</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`mt-2 text-3xl font-extrabold ${iLost ? 'text-ink' : 'text-gradient-warm'}`}
          >
            {headline}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-sm text-ink-2 mt-1"
          >
            {sub}
          </motion.p>

          <Scoreboard players={players} kind={g.kind} online={online} winnerPlayer={g.winner_player} winnerTeam={g.winner_team} />

          <InlineAd />

          <div className="mt-5 flex flex-col gap-2">
            {amPlayer && (() => {
              const iWant = !!me?.wants_rematch
              const oppWants = players.some((p) => p.user_id !== myId && p.wants_rematch)
              const voted = players.filter((p) => p.wants_rematch).length
              if (iWant) {
                return (
                  <div className="w-full rounded-full py-3 text-center font-bold glass text-ink-2 flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                    Waiting for opponent… ({voted}/{players.length})
                  </div>
                )
              }
              return (
                <>
                  {oppWants && <p className="text-sm text-success text-center font-semibold">🔁 Opponent wants a rematch!</p>}
                  <button onClick={() => rematchVote.mutate(g.id)} disabled={rematchVote.isPending}
                    className="w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60">
                    {rematchVote.isPending ? '…' : oppWants ? '✅ Accept rematch' : '🔁 Rematch'}
                  </button>
                </>
              )
            })()}
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

  // Live solved % per player, shown by each name in the VS header while racing.
  // My own order comes in locally (broadcast is self:false); others' over it.
  const racing = r?.status === 'racing'
  const total = racing ? gridForRound(r!.round_no) ** 2 : 0
  const pctById = new Map<string, number>()
  if (racing) {
    for (const p of players) {
      const order = p.user_id === myId ? myOrder : progress.get(p.user_id)?.order
      pctById.set(p.user_id, order ? Math.round((solvedCount(order) / total) * 100) : 0)
    }
  }

  // Pixel Rush uses the cyan/teal lobby palette throughout the match so the
  // surface stays uniform from invite → countdown → gameplay. Other games
  // keep the default warm/rose palette until they're themed too.
  const isPixelRush = g.game_type === 'pixel_rush'
  const cyan = '#35CDE8'
  const cyan2 = '#6CE8FA'
  const pixelRushBg = isPixelRush
    ? {
        backgroundColor: '#050B14',
        backgroundImage:
          `radial-gradient(900px 600px at 12% 10%, rgba(53,205,232,0.11), transparent 60%),
           radial-gradient(900px 600px at 92% 92%, rgba(108,232,250,0.08), transparent 60%)`,
      }
    : undefined

  // ── Pixel Rush — fully canvas-based racing surface ─────────────────────
  // When pixel_rush is in active racing AND the viewer is a player, render
  // the canvas HUD + PixelRushCanvas with no surrounding DOM (no fixed-top
  // DOM header, no DOM "rebuild this picture" preview, no DOM instructions).
  // Other states (awaiting_image / done / finished) keep their DOM
  // implementations until subsequent sessions migrate them.
  if (isPixelRush && g.status === 'active' && amPlayer && r?.status === 'racing') {
    const meIdx = players.findIndex((p) => p.user_id === myId)
    const opponent = meIdx >= 0 ? players[1 - meIdx] : players[0]
    const myP = meIdx >= 0 ? players[meIdx] : players[1]
    const toChip = (p: GamePlayer | undefined, isMe: boolean) => {
      if (!p) return null
      return {
        userId: p.user_id,
        name: playerLabel(p),
        avatarUrl: avatarUrlOr(p.profile?.avatar_url),
        score: p.score,
        trophies: p.trophies,
        pct: pctById.get(p.user_id) ?? null,
        online: online.has(p.user_id),
        isMe,
        isHost: !!p.is_host,
      }
    }
    return (
      <div className="min-h-screen relative" style={pixelRushBg}>
        <PixelRushHUDCanvas
          left={toChip(opponent, false)}
          right={toChip(myP, true)}
          currentRound={g.current_round}
          totalRounds={g.rounds_total}
          trophiesLeft={opponent?.trophies}
          trophiesRight={myP?.trophies}
          isHost={isHost}
          isPlayer={amPlayer}
          onLeaveClick={onLeave}
        />
        {/* Gameplay canvas — padded to clear the fixed HUD (118px) + Telegram inset. */}
        <div
          className="flex items-start justify-center"
          style={{
            paddingTop: 'calc(var(--lm-top-inset) + 118px + 16px)',
            paddingBottom: '2rem',
            paddingLeft: '12px',
            paddingRight: '12px',
          }}
        >
          <PixelRushCanvas
            image={r.image_url!}
            seed={seedFor(g.id, r.round_no)}
            grid={gridForRound(r.round_no)}
            startedAt={r.started_at ? Date.parse(r.started_at) : Date.now()}
            locked={false}
            onSolve={(timeMs) => submit.mutate({ gameId: g.id, round: r.round_no, timeMs })}
            onProgress={(order, done) => { setMyOrder(order); if (myId) sendProgress(myId, order, done) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen text-ink ${isPixelRush ? '' : 'bg-surface'}`}
      style={pixelRushBg}
    >
      <PopunderAd />
      {/* Fixed VS header — opponents + scores + close/leave. */}
      <div
        className={`fixed top-0 left-0 right-0 z-20 glass ${
          isPixelRush ? 'border-b' : 'border-b border-white/5'
        }`}
        style={{
          paddingTop: 'var(--lm-top-inset)',
          ...(isPixelRush
            ? { borderBottomColor: `${cyan}33`, backgroundColor: 'rgba(10,26,44,0.55)' }
            : {}),
        }}
      >
        <div className="max-w-md mx-auto px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[11px] font-bold tabular-nums"
              style={isPixelRush ? { color: cyan2, letterSpacing: '0.1em' } : { color: 'var(--color-ink-2)' }}
            >
              ROUND {g.current_round}/{g.rounds_total}
            </span>
            <div className="flex items-center gap-3">
              {viewers > 0 && <span className="text-[11px] text-ink-muted">👁 {viewers}</span>}
              <MessagesPill />
              {isHost ? (
                <button onClick={onClose} aria-label="Close game"
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-danger/15 text-danger ring-1 ring-danger/40 active:scale-95 transition">
                  <span aria-hidden className="text-sm leading-none">⏻</span> Close
                </button>
              ) : amPlayer ? (
                <button onClick={onLeave} aria-label="Leave game"
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-danger/15 text-danger ring-1 ring-danger/40 active:scale-95 transition">
                  <span aria-hidden className="text-sm leading-none">⏻</span> Leave
                </button>
              ) : (
                <button onClick={() => navigate('/feed')} aria-label="Exit"
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold glass text-ink-2 ring-1 ring-white/10 active:scale-95 transition">
                  <span aria-hidden className="text-sm leading-none">✕</span> Exit
                </button>
              )}
            </div>
          </div>
          <VSHeader players={players} kind={g.kind} online={online} pctById={pctById} myId={myId} accent={isPixelRush ? cyan : undefined} />
        </div>
      </div>

      {/* Content (clears the fixed header). */}
      <div className="max-w-md mx-auto px-4" style={{ paddingTop: 'calc(var(--lm-top-inset) + 6.5rem)', paddingBottom: '8rem' }}>
        {g.game_type === 'number_duel' ? (
          <DuelArena g={g} players={players} myId={myId} amPlayer={amPlayer} />
        ) : g.game_type === 'draughts' ? (
          <DraughtsArena g={g} players={players} myId={myId} amPlayer={amPlayer} />
        ) : !r || round.isPending ? (
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
              <InlineAd />
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
              {/* Drag a tile onto another to swap them. */}
              <div>
                <div className="text-center text-[10px] text-ink-muted mb-1">✥ drag a tile onto another, or tap two tiles, to swap</div>
                <PixelRushCanvas
                  image={r.image_url!}
                  seed={seedFor(g.id, r.round_no)}
                  grid={gridForRound(r.round_no)}
                  startedAt={r.started_at ? Date.parse(r.started_at) : Date.now()}
                  locked={false}
                  onSolve={(timeMs) => submit.mutate({ gameId: g.id, round: r.round_no, timeMs })}
                  onProgress={(order, done) => { setMyOrder(order); if (myId) sendProgress(myId, order, done) }}
                />
              </div>
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
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-muted">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              <span>{g.current_round >= g.rounds_total ? 'Tallying final results…' : 'Next round starting…'}</span>
            </div>
            <InlineAd />
          </div>
        )}

        {/* Network-aware status. While offline or still saving a solve, we keep
            playing and sync behind the scenes — no scary error, no hang. */}
        {(!isOnline || submit.isPending) && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-muted">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
            <span>{isOnline ? 'Saving your result…' : 'Offline — your moves are safe, syncing when you reconnect'}</span>
          </div>
        )}
        {/* Only surface a real (non-network) error; network blips self-heal. */}
        {(submit.error || setImg.error) && !submit.isPending && (
          <p className="mt-3 text-xs text-danger text-center">
            {isNetworkError(submit.error || setImg.error)
              ? 'Connection problem — retrying automatically.'
              : ((submit.error || setImg.error) as Error).message}
          </p>
        )}
      </div>

      {/* Live comments + emoji. Viewers comment/like; players read via a
          "View comments" button so their board stays clean. */}
      <LiveOverlay
        mode={amPlayer ? 'player' : 'viewer'}
        comments={live.comments}
        emojis={live.emojis}
        senderName={senderName}
        onComment={live.sendComment}
        onEmoji={live.sendEmoji}
        removeEmoji={live.removeEmoji}
      />
    </div>
  )
}

/** The opponents bar: A — VS — B with avatars + scores (or team totals).
 *  `pctById` carries each player's live solved % during a race (empty otherwise);
 *  it's shown by their name so you can see who's closest to finishing. */
function VSHeader({ players, kind, online, pctById, myId, accent }: {
  players: GamePlayer[]; kind: string; online: Set<string>
  pctById: Map<string, number>; myId: string | null
  /** Optional accent colour — overrides the default warm gradient. Pixel Rush
   *  passes "#35CDE8" so the VS text + scores match the cyan lobby theme. */
  accent?: string
}) {
  const titleStyle = accent ? { color: accent } : undefined
  const teamLabelStyle = accent ? { color: accent } : undefined
  if (kind === 'group') {
    const teamA = players.filter((p) => p.team === 'A')
    const teamB = players.filter((p) => p.team === 'B')
    const a = teamA.reduce((s, p) => s + p.score, 0)
    const b = teamB.reduce((s, p) => s + p.score, 0)
    const avg = (t: GamePlayer[]) => t.length && pctById.size
      ? Math.round(t.reduce((s, p) => s + (pctById.get(p.user_id) ?? 0), 0) / t.length)
      : null
    const pa = avg(teamA), pb = avg(teamB)
    const ta = teamA.reduce((m, p) => Math.max(m, p.trophies), 0)
    const tb = teamB.reduce((m, p) => Math.max(m, p.trophies), 0)
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <div className={`text-[11px] font-bold ${accent ? '' : 'text-rose'}`} style={teamLabelStyle}>Team A</div>
          <div className="text-2xl font-extrabold text-ink">{a}</div>
          {pa != null && <div className={`text-[11px] font-bold tabular-nums ${accent ? '' : 'text-gradient-warm'}`} style={titleStyle}>{pa}%</div>}
        </div>
        <div className="flex flex-col items-center px-2">
          {ta + tb > 0 && <span className="text-sm font-extrabold text-gold tabular-nums leading-none">🏆 {ta} : {tb}</span>}
          <span className={`text-sm font-extrabold ${accent ? '' : 'text-gradient-warm'}`} style={titleStyle}>VS</span>
        </div>
        <div className="flex-1 text-center">
          <div className={`text-[11px] font-bold ${accent ? '' : 'text-rose'}`} style={teamLabelStyle}>Team B</div>
          <div className="text-2xl font-extrabold text-ink">{b}</div>
          {pb != null && <div className={`text-[11px] font-bold tabular-nums ${accent ? '' : 'text-gradient-warm'}`} style={titleStyle}>{pb}%</div>}
        </div>
      </div>
    )
  }
  // If the viewer is a player, always put THEM on the right. Spectators
  // keep the default (host left / joiner right by joined_at order).
  const meIdx = players.findIndex((p) => p.user_id === myId)
  const a = meIdx >= 0 ? players[1 - meIdx] : players[0]
  const b = meIdx >= 0 ? players[meIdx] : players[1]
  const trophyTally = (a?.trophies ?? 0) + (b?.trophies ?? 0)
  return (
    <div className="flex items-center justify-between gap-2">
      <PlayerChip p={a} online={!!a && online.has(a.user_id)} align="left" pct={a ? pctById.get(a.user_id) : undefined} isMe={!!a && a.user_id === myId} accent={accent} />
      <div className="flex flex-col items-center shrink-0">
        {trophyTally > 0 && <span className="text-sm font-extrabold text-gold tabular-nums leading-none">🏆 {a?.trophies ?? 0} : {b?.trophies ?? 0}</span>}
        <span className={`text-sm font-extrabold ${accent ? '' : 'text-gradient-warm'}`} style={titleStyle}>VS</span>
      </div>
      <PlayerChip p={b} online={!!b && online.has(b.user_id)} align="right" pct={b ? pctById.get(b.user_id) : undefined} isMe={!!b && b.user_id === myId} accent={accent} />
    </div>
  )
}

function PlayerChip({ p, online, align, pct, isMe, accent }: {
  p?: GamePlayer; online: boolean; align: 'left' | 'right'; pct?: number; isMe?: boolean; accent?: string
}) {
  if (!p) return <div className="flex-1 text-center text-[11px] text-ink-muted">waiting…</div>
  const accentStyle = accent ? { color: accent } : undefined
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className="relative shrink-0">
        <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-9 h-9 rounded-full object-cover" />
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-2 ${online ? 'bg-success' : 'bg-ink-muted'}`} />
      </span>
      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-bold text-ink truncate">{isMe ? 'You' : playerLabel(p)}</span>
          {pct != null && <span className={`text-[11px] font-bold tabular-nums shrink-0 ${accent ? '' : 'text-gradient-warm'}`} style={accentStyle}>{pct}%</span>}
        </div>
        <div className={`text-lg font-extrabold leading-none ${accent ? '' : 'text-gradient-warm'}`} style={accentStyle}>{p.score}</div>
      </div>
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

function Scoreboard({ players, kind, online, winnerPlayer, winnerTeam }: {
  players: GamePlayer[]; kind: string; online: Set<string>
  winnerPlayer?: string | null; winnerTeam?: string | null
}) {
  if (kind === 'group') {
    const a = players.filter((p) => p.team === 'A').reduce((s, p) => s + p.score, 0)
    const b = players.filter((p) => p.team === 'B').reduce((s, p) => s + p.score, 0)
    const box = (team: string, total: number) => (
      <div className={`glass rounded-2xl p-3 text-center ${winnerTeam === team ? 'ring-2 ring-gold' : ''}`}>
        <div className="text-[11px] text-rose font-bold">{winnerTeam === team && '👑 '}Team {team}</div>
        <div className="text-2xl font-extrabold text-ink">{total}</div>
      </div>
    )
    return <div className="mt-4 grid grid-cols-2 gap-3">{box('A', a)}{box('B', b)}</div>
  }
  return (
    <ul className="mt-4 space-y-1.5 text-left">
      {[...players].sort((x, y) => y.score - x.score).map((p) => {
        const isOn = online.has(p.user_id)
        const won = winnerPlayer === p.user_id
        return (
          <li key={p.id} className={`flex items-center justify-between glass rounded-xl px-3 py-2 ${won ? 'ring-2 ring-gold' : ''}`}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="relative shrink-0">
                <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-surface-2 ${isOn ? 'bg-success' : 'bg-ink-muted'}`} />
              </span>
              <span className="text-sm text-ink truncate">{won && '👑 '}{playerLabel(p)}</span>
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
      <PopunderAd />
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`glass rounded-3xl p-6 ${className}`}>
      {children}
    </motion.div>
  )
}

/** A short confetti burst for the winner's screen. */
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 1.7 + Math.random() * 1.4,
      rot: (Math.random() - 0.5) * 720,
      color: ['#ff4d8d', '#ffd166', '#06d6a0', '#5b8cff', '#c77dff'][i % 5],
      w: 6 + Math.random() * 6,
    })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute -top-3 rounded-[2px]"
          style={{ left: `${p.x}%`, width: p.w, height: p.w * 1.5, background: p.color }}
          initial={{ y: 0, opacity: 0, rotate: 0 }}
          animate={{ y: '130%', opacity: [0, 1, 1, 0], rotate: p.rot }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, repeatDelay: 0.5, ease: 'easeIn' }}
        />
      ))}
    </div>
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

/** Natural relative phrase for the ended-game message: "just ended",
 *  "ended 7 minutes ago", "ended 2 hours ago", "ended 3 days ago", etc. */
function endedPhrase(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just ended'
  if (s < 3600) {
    const m = Math.floor(s / 60)
    return `ended ${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600)
    return `ended ${h} hour${h === 1 ? '' : 's'} ago`
  }
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400)
    return `ended ${d} day${d === 1 ? '' : 's'} ago`
  }
  return `ended on ${new Date(iso).toLocaleDateString()}`
}

/** Draughts content area — fetches the current board via realtime, decides
 *  the viewer's colour from the host_id, and renders DraughtsBoard. Also
 *  drives auto-advance to the next board after a 3.5s pause when a round
 *  ends (matches Pixel Rush behaviour). */
function DraughtsArena({
  g, players, myId, amPlayer,
}: { g: Game; players: GamePlayer[]; myId: string | null; amPlayer: boolean }) {
  const rq = useDraughtsRound(g.id, g.current_round)
  const advance = useAdvanceDraughts()
  const status = rq.data?.status
  const roundNo = rq.data?.round_no
  // Players drive auto-advance; the server serialises so only one of them
  // actually advances and the rest are no-ops.
  useEffect(() => {
    if (!amPlayer || g.status !== 'active' || status !== 'done' || !roundNo) return
    const t = window.setTimeout(() => advance.mutate({ gameId: g.id, round: roundNo }), 3500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amPlayer, g.status, g.id, status, roundNo])

  if (rq.isPending || !rq.data) {
    return <div className="py-10 text-center text-ink-muted text-sm">Setting up the board…</div>
  }
  const round = rq.data
  const myColor = amPlayer ? (myId === g.host_id ? 'r' : 'b') : null
  const myTurn = amPlayer && round.turn_user_id === myId && round.status === 'playing'
  // Viewer-on-right ordering (matches the VS header convention).
  const meIdx = players.findIndex((p) => p.user_id === myId)
  const left  = meIdx >= 0 ? players[1 - meIdx] : players[0]
  const right = meIdx >= 0 ? players[meIdx]     : players[1]
  const opponentId = players.find((p) => p.user_id !== myId)?.user_id ?? null

  // Best-of-3 → first to 2 wins. Show ceil(N/2) chip slots per player.
  const targetWins = Math.ceil(g.rounds_total / 2)

  return (
    <div>
      {/* Round-win chip stacks. Each filled chip = a board this side has
          won; empty chips show the road to victory. Filling a slot is
          animated (slide up + scale in) instead of just appearing. */}
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <ChipStack
          align="left"
          player={left}
          target={targetWins}
        />
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
            Round {g.current_round}/{g.rounds_total}
          </div>
          <div className="text-[10px] text-ink-2 font-bold mt-0.5">First to {targetWins}</div>
        </div>
        <ChipStack
          align="right"
          player={right}
          target={targetWins}
        />
      </div>

      <DraughtsBoard
        gameId={g.id}
        round={g.current_round}
        board={round.board}
        myColor={myColor}
        myTurn={myTurn}
        opponentId={opponentId}
      />
      {round.status === 'done' && (
        <div className="mt-4 text-center text-sm text-ink-2 flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <span>{g.current_round >= g.rounds_total ? 'Tallying final results…' : 'Next board starting…'}</span>
        </div>
      )}
    </div>
  )
}

/** Win-tally chip row for a player. Filled coin = a board they've won so
 *  far; empty slots show what's left. A newly-won chip slides up + scales
 *  in so the user sees the stack grow. */
function ChipStack({
  align, player, target,
}: { align: 'left' | 'right'; player?: GamePlayer; target: number }) {
  const won = Math.min(player?.score ?? 0, target)
  const chips = Array.from({ length: target }, (_, i) => i < won)
  // For the right column we render the chips reversed so newer wins sit
  // closer to the player's name.
  const seq = align === 'right' ? [...chips].reverse() : chips
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="relative shrink-0">
        <img src={avatarUrlOr(player?.profile?.avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
      </span>
      <div className={`flex-1 min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
        <div className="text-[11px] font-bold text-ink truncate">
          {player ? playerLabel(player) : '—'}
        </div>
        <div className={`flex gap-1 mt-0.5 ${align === 'right' ? 'justify-end' : ''}`}>
          {seq.map((filled, i) => (
            <motion.span
              key={`${player?.id}-${i}`}
              initial={filled ? { y: 14, scale: 0.4, opacity: 0 } : false}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22, delay: filled ? i * 0.06 : 0 }}
              className={[
                'w-4 h-4 rounded-full ring-2',
                filled
                  ? 'bg-gradient-to-br from-gold to-coral ring-gold/70 shadow-[0_0_8px_rgba(255,200,80,0.6)]'
                  : 'bg-white/[0.06] ring-white/15',
              ].join(' ')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Chat icon in the in-game header — same icon as the feed top bar. */
function MessagesPill() {
  const unread = (useConversations().data ?? []).filter((c) => c.unread_count > 0).length
  return (
    <Link
      to="/chat"
      aria-label="Messages"
      className="relative w-10 h-10 grid place-items-center text-ink-2 hover:text-ink transition-colors"
    >
      <IconMail size={22} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
