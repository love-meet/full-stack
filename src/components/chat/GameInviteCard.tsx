import { Link } from 'react-router-dom'
import { useGameByCode } from '../../hooks/usePixelGame'

/**
 * Renders a shared Pixel Rush invite as a tappable card instead of a bare URL.
 * The call-to-action reflects the live game state:
 *   • lobby     → "Join game"
 *   • active    → "Game is already live · Watch live"
 *   • finished/gone → "Game expired" (disabled)
 */
export default function GameInviteCard({ code }: { code: string }) {
  const { data: g, isPending } = useGameByCode(code)

  const ended = !isPending && (!g || g.status === 'finished')
  const live = g?.status === 'active'
  const joinable = g?.status === 'lobby'

  const isDuel = g?.game_type === 'number_duel'
  const isDraughts = g?.game_type === 'draughts'
  const sub = isPending ? 'Loading…'
    : ended ? 'This match has ended.'
    : live ? 'Game is already live'
    : joinable ? 'You’re invited to a match'
    : 'Match invite'
  const cta = live ? '🔴 Watch live' : 'Join game'

  return (
    <div className="w-[244px] max-w-full rounded-2xl overflow-hidden bg-black/25 ring-1 ring-white/10">
      <div className="px-3.5 pt-3">
        <div className="text-sm font-extrabold text-gradient-warm">{isDraughts ? '♟ Draughts' : isDuel ? '🔢 Number Duel' : '🧩 Pixel Rush'}</div>
        <div className="text-[12px] text-ink-2 mt-0.5">{sub}</div>
      </div>
      <div className="p-3 pt-2.5">
        {ended ? (
          <div className="w-full rounded-full py-2 text-center text-xs font-bold bg-white/10 text-ink-muted">
            Game expired
          </div>
        ) : isPending ? (
          <div className="w-full rounded-full py-2 text-center text-xs font-bold bg-white/10 text-ink-muted">…</div>
        ) : (
          <Link
            to={`/play/${code}`}
            onClick={(e) => e.stopPropagation()}
            className={[
              'block w-full rounded-full py-2 text-center text-xs font-bold text-white',
              live ? 'bg-coral' : 'bg-gradient-brand',
            ].join(' ')}
          >
            {cta}
          </Link>
        )}
      </div>
    </div>
  )
}

/** Pull a /play/CODE invite code out of message text, if present. */
export function playCodeFromText(text?: string | null): string | null {
  if (!text) return null
  const m = text.match(/\/play\/([A-Za-z0-9]{4,16})/)
  return m ? m[1] : null
}
