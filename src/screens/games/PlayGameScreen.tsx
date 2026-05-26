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
  playerLabel,
  type GamePlayer,
  type Game,
} from '../../hooks/usePixelGame'
import { useUploadChatMedia } from '../../hooks/useUploadChatMedia'
import { useGamePresence } from '../../hooks/useGamePresence'
import PixelBoard, { seedFor } from '../../components/games/PixelBoard'
import { avatarUrlOr } from '../../lib/avatar'

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

  const game = useGameByCode(code)
  const players = useGamePlayers(game.data?.id)
  const join = useJoinGame()
  const start = useStartGame()
  const online = useGamePresence(game.data?.id, session?.user.id ?? null)

  const [name, setName] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const myId = session?.user.id ?? null
  const isAnon = !!session?.user.is_anonymous
  const list = players.data ?? []
  const me = list.find((p) => p.user_id === myId)
  const inGame = !!me
  const isHost = !!me?.is_host
  const g = game.data
  const inviteUrl = g ? `${window.location.origin}/play/${g.invite_code}` : ''

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
    return <Frame><Match g={g} players={list} myId={myId} online={online} /></Frame>
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
          <p className="text-[11px] text-ink-muted mt-1">Anyone with the link can join — no account needed.</p>
        </div>

        <PlayerList players={list} kind={g.kind} online={online} />

        {isHost ? (
          <button
            onClick={() => g && start.mutate(g.id)}
            disabled={!canStart || start.isPending}
            className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60"
          >
            {start.isPending ? 'Starting…' : canStart ? 'Start game' : 'Waiting for players…'}
          </button>
        ) : (
          <p className="mt-5 text-center text-sm text-ink-muted">Waiting for the host to start…</p>
        )}
        {start.error && <p className="text-xs text-danger mt-2 text-center">{(start.error as Error).message}</p>}
      </Card>
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
function Match({ g, players, myId, online }: { g: Game; players: GamePlayer[]; myId: string | null; online: Set<string> }) {
  const navigate = useNavigate()
  const round = useGameRound(g.id, g.current_round)
  const setImg = useSetRoundImage()
  const submit = useSubmitSolve()
  const advance = useAdvanceRound()
  const reassign = useReassignTurn()
  const createGame = useCreateGame()
  const upload = useUploadChatMedia()

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

  // Finished
  if (g.status === 'finished') {
    const champ = g.kind === '1v1'
      ? players.find((p) => p.user_id === g.winner_player)
      : null
    return (
      <Card>
        <div className="text-center">
          <div className="text-6xl">🏆</div>
          <h1 className="mt-2 text-2xl font-extrabold text-gradient-warm">
            {g.kind === '1v1'
              ? `${champ ? playerLabel(champ) : 'Someone'} wins!`
              : `Team ${g.winner_team ?? '—'} wins!`}
          </h1>
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
    )
  }

  const turnPlayer = players.find((p) => p.user_id === r?.turn_user_id)
  const winner = players.find((p) => p.user_id === r?.winner_player)

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink">Round {g.current_round}/{g.rounds_total}</span>
        <span className="text-[11px] text-ink-muted">{g.kind === '1v1' ? '1 v 1' : 'Teams'}</span>
      </div>

      <Scoreboard players={players} kind={g.kind} online={online} />

      <div className="mt-4">
        {!r || round.isPending ? (
          <Spinner />
        ) : r.status === 'awaiting_image' ? (
          r.turn_user_id === myId ? (
            <div className="text-center">
              <p className="text-sm text-ink-2 mb-3">Your turn — pick a picture for everyone to race.</p>
              <label className="inline-block rounded-full px-6 py-3 bg-gradient-brand text-white font-bold glow-rose cursor-pointer">
                {upload.isPending || setImg.isPending ? 'Uploading…' : 'Upload picture'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickRoundImage(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-ink-muted">
                Waiting for <b className="text-ink">{turnPlayer ? playerLabel(turnPlayer) : 'the next player'}</b> to pick a picture…
                {turnPlayer && !online.has(turnPlayer.user_id) && <span className="block text-danger mt-1">They seem to have left — skip them.</span>}
              </p>
              {isHost && (
                <button
                  onClick={() => reassign.mutate({ gameId: g.id, round: r.round_no })}
                  disabled={reassign.isPending}
                  className="mt-3 text-xs font-bold rounded-full px-4 py-1.5 glass text-ink-2 hover:text-ink disabled:opacity-60"
                >
                  Skip player →
                </button>
              )}
            </div>
          )
        ) : r.status === 'racing' ? (
          <>
            {amPlayer ? (
              <PixelBoard
                image={r.image_url!}
                seed={seedFor(g.id, r.round_no)}
                startedAt={r.started_at ? Date.parse(r.started_at) : Date.now()}
                locked={false}
                onSolve={(timeMs) => submit.mutate({ gameId: g.id, round: r.round_no, timeMs })}
              />
            ) : (
              <p className="text-center text-sm text-ink-muted py-6">🍿 Race in progress — you're spectating.</p>
            )}
            {isHost && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => advance.mutate(g.id)}
                  disabled={advance.isPending}
                  className="text-xs font-bold rounded-full px-4 py-1.5 glass text-ink-2 hover:text-ink disabled:opacity-60"
                >
                  End round (no winner) →
                </button>
              </div>
            )}
          </>
        ) : (
          // done
          <div className="text-center py-4">
            <div className="text-4xl">🎉</div>
            <p className="mt-2 font-extrabold text-ink">
              {winner ? (winner.user_id === myId ? 'You won the round!' : `${playerLabel(winner)} won the round`) : 'Round over'}
            </p>
            {r.winner_time_ms != null && <p className="text-sm text-ink-muted">{(r.winner_time_ms / 1000).toFixed(1)}s</p>}
            {isHost ? (
              <button
                onClick={() => advance.mutate(g.id)}
                disabled={advance.isPending}
                className="mt-4 rounded-full px-6 py-2.5 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60"
              >
                {advance.isPending ? '…' : g.current_round >= g.rounds_total ? 'Finish game' : 'Next round'}
              </button>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Waiting for the host…</p>
            )}
          </div>
        )}
      </div>

      {(submit.error || setImg.error) && (
        <p className="mt-3 text-xs text-danger text-center">{((submit.error || setImg.error) as Error).message}</p>
      )}
    </Card>
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
