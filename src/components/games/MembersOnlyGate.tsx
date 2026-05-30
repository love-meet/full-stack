import { useNavigate } from 'react-router-dom'

/**
 * The warm "you need a paid plan to host" card. Used by PixelRush + Number
 * Duel create flows. Free users still join invites — that's emphasised here.
 */
export default function MembersOnlyGate({
  headline = 'Want to host your own game?',
}: {
  headline?: string
}) {
  const navigate = useNavigate()
  return (
    <div className="mt-6 max-w-md mx-auto glass rounded-3xl p-7 text-center space-y-4 border border-rose/30">
      <div className="text-5xl">🎮</div>

      <div className="space-y-1.5">
        <h2 className="text-xl font-extrabold text-gradient-warm">{headline}</h2>
        <p className="text-sm text-ink-2 leading-relaxed">
          Hosting a match is a <b>Premium</b> &amp; <b>VIP</b> perk — it keeps games
          fun, fair, and spam-free.
        </p>
      </div>

      <ul className="rounded-2xl bg-white/[0.04] p-3.5 text-left space-y-2">
        <li className="text-[13px] text-ink flex items-start gap-2"><span aria-hidden>🎯</span> Pick the game, invite friends, set the pace.</li>
        <li className="text-[13px] text-ink flex items-start gap-2"><span aria-hidden>🏆</span> Trophies stack across every match you host.</li>
        <li className="text-[13px] text-ink flex items-start gap-2"><span aria-hidden>📣</span> Share invites in chat or with a link.</li>
      </ul>

      <p className="text-[12px] text-success rounded-2xl bg-success/10 ring-1 ring-success/20 px-3 py-2 text-left">
        💡 Good news — you can still <b>join</b> any game someone sends you. No
        plan needed for that.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => navigate('/subscription')}
          className="w-full rounded-full py-3 bg-gradient-brand text-white text-sm font-bold glow-rose"
        >
          See plans
        </button>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-ink-muted hover:text-ink py-1"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
