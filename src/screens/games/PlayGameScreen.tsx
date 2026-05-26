import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import {
  useGameByCode,
  useGamePlayers,
  useJoinGame,
  useStartGame,
  playerLabel,
  type GamePlayer,
} from '../../hooks/usePixelGame'
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
    return (
      <Frame>
        <Card>
          <div className="text-center">
            <div className="text-5xl">{g.status === 'finished' ? '🏆' : '🎮'}</div>
            <h1 className="mt-2 text-xl font-extrabold text-gradient-warm">
              {g.status === 'finished' ? 'Game over' : 'Game on!'}
            </h1>
            <p className="text-sm text-ink-2 mt-1">
              {g.status === 'finished'
                ? 'Thanks for playing Pixel Rush.'
                : `Round ${g.current_round} of ${g.rounds_total}.`}
            </p>
          </div>
          <PlayerList players={list} kind={g.kind} />
          <p className="mt-4 text-[12px] text-ink-muted text-center">
            The live round-by-round picture race is rolling out next. Your lobby and scores are saved.
          </p>
        </Card>
      </Frame>
    )
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

        <PlayerList players={list} kind={g.kind} />

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

function PlayerList({ players, kind }: { players: GamePlayer[]; kind: string }) {
  const teamA = players.filter((p) => p.team === 'A')
  const teamB = players.filter((p) => p.team === 'B')
  return (
    <div className="mt-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold mb-2">
        Players ({players.length})
      </div>
      {kind === 'group' ? (
        <div className="grid grid-cols-2 gap-3">
          <TeamCol label="Team A" players={teamA} />
          <TeamCol label="Team B" players={teamB} />
        </div>
      ) : (
        <ul className="space-y-2">{players.map((p) => <PlayerRow key={p.id} p={p} />)}</ul>
      )}
    </div>
  )
}

function TeamCol({ label, players }: { label: string; players: GamePlayer[] }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="text-[11px] font-bold text-rose mb-2">{label}</div>
      <ul className="space-y-2">{players.map((p) => <PlayerRow key={p.id} p={p} />)}</ul>
      {players.length === 0 && <p className="text-[11px] text-ink-muted">—</p>}
    </div>
  )
}

function PlayerRow({ p }: { p: GamePlayer }) {
  return (
    <li className="flex items-center gap-2">
      <img src={avatarUrlOr(p.profile?.avatar_url)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
      <span className="text-sm text-ink truncate">{playerLabel(p)}</span>
      {p.is_host && <span className="text-[9px] font-bold uppercase tracking-wider text-gold">host</span>}
    </li>
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
