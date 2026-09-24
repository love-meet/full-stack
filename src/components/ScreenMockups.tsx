/**
 * The three screens, drawn rather than photographed.
 *
 * §02 asks for "real screens — the feed, a chat with a game running, the tips
 * section. People install what they can already picture themselves using."
 *
 * Empty phone frames with an icon in the middle do the opposite: they show
 * that there is nothing to show. So until Olivia's captures land, these are
 * built from the same components the app uses — the same card shape, the same
 * three buttons, the same bubble radius, the same board. Someone looking at
 * this is looking at Love meet, not at a placeholder pretending to be it.
 *
 * They are also not lies: every element here exists in the product. Nothing
 * is drawn that the app cannot do.
 *
 * ── FOR OLIVIA ───────────────────────────────────────────────────────────
 * Drop real captures into /public/shots as feed.png, game.png and tips.png
 * and they replace these automatically — see Screenshots.tsx. These stay as
 * the fallback, so a missing file degrades to a drawing rather than a hole.
 */
import { HeartIcon, CloseIcon, GiftIcon } from './FeedIcons'

/** Shared phone chrome so all three sit at the same size and radius. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[220px] aspect-[9/19.5] rounded-[1.75rem] overflow-hidden bg-[#0d0a18] ring-1 ring-white/12 shadow-2xl">
      {/* Status bar — just enough to read as a phone. */}
      <div className="absolute top-0 inset-x-0 h-6 flex items-center justify-between px-3 text-[7px] text-white/50 font-semibold z-10">
        <span>9:41</span>
        <span>●●●</span>
      </div>
      {children}
    </div>
  )
}

/** The feed: one face, three actions. */
export function FeedMock() {
  return (
    <Phone>
      <div className="absolute inset-0">
        {/* The picture fills the card, as it does in the app. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, #6d3f8f 0%, #3b2a5e 45%, #171029 100%)',
          }}
        />
        {/* A suggestion of a person rather than a stock face we do not own. */}
        <div
          className="absolute left-1/2 top-[22%] -translate-x-1/2 w-24 h-24 rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), transparent 62%)' }}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="text-white text-[13px] font-extrabold leading-none">Amara <span className="font-bold text-white/70">24</span></div>
          <div className="mt-0.5 text-[8px] text-white/60">@amara</div>
          <div className="mt-1.5 flex gap-1">
            <span className="rounded-full px-1.5 py-0.5 bg-white/15 text-white text-[7px] font-semibold">Lagos, Nigeria</span>
            <span className="rounded-full px-1.5 py-0.5 bg-white/15 text-white text-[7px] font-semibold">English</span>
          </div>

          {/* The three actions, in the app's own order and weighting. */}
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center bg-white/10 ring-1 ring-white/20 text-white/80">
              <CloseIcon className="w-3 h-3" />
            </span>
            <span className="flex-1 h-7 rounded-full bg-gradient-brand text-white text-[9px] font-extrabold flex items-center justify-center gap-1">
              <HeartIcon filled className="w-2.5 h-2.5" /> Interested
            </span>
            <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center bg-white/10 ring-1 ring-white/20 text-white">
              <GiftIcon className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </Phone>
  )
}

/** A chat with a game running in it. */
export function GameMock() {
  // A real noughts-and-crosses position, mid-game.
  const cells = ['X', '', 'O', '', 'X', '', 'O', '', '']
  return (
    <Phone>
      <div className="absolute inset-0 pt-6 flex flex-col">
        <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/8">
          <span className="w-5 h-5 rounded-full bg-gradient-brand shrink-0" />
          <span className="text-[9px] font-bold text-white">Tunde</span>
          <span className="ml-auto text-[10px] text-white/40">🎲</span>
        </div>

        {/* The board sits above the thread, where the app puts it. */}
        <div className="mx-2 mt-2 rounded-xl bg-white/[0.06] ring-1 ring-white/10 p-2">
          <div className="text-[7px] font-bold uppercase tracking-wider text-rose">Your turn</div>
          <div className="mt-1 grid grid-cols-3 gap-0.5 w-[66px] mx-auto">
            {cells.map((c, i) => (
              <span
                key={i}
                className="aspect-square rounded-[3px] bg-white/10 grid place-items-center text-[10px] font-black text-white"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 px-2 pt-2 space-y-1.5">
          <div className="max-w-[72%] rounded-2xl rounded-bl-sm bg-white/10 px-2 py-1 text-[8px] text-white/90">
            your move 😄
          </div>
          <div className="ml-auto max-w-[72%] rounded-2xl rounded-br-sm bg-gradient-brand px-2 py-1 text-[8px] text-white">
            give me a second
          </div>
        </div>

        <div className="m-2 h-6 rounded-full bg-white/[0.07] ring-1 ring-white/10 flex items-center px-2 text-[7px] text-white/35">
          Message…
        </div>
      </div>
    </Phone>
  )
}

/** The tips section. */
export function TipsMock() {
  const tips = [
    'Ask about the thing they mentioned in passing',
    'A game is easier than a first line',
    'Nobody real asks you for money',
  ]
  return (
    <Phone>
      <div className="absolute inset-0 pt-6">
        <div className="px-2.5 py-1.5 text-[10px] font-extrabold text-white">Tips</div>
        <div className="px-2.5 flex gap-1">
          <span className="rounded-full px-2 py-0.5 bg-gradient-brand text-white text-[7px] font-bold">Advice</span>
          <span className="rounded-full px-2 py-0.5 bg-white/10 text-white/60 text-[7px] font-bold">Topics</span>
        </div>
        <div className="mt-2 px-2 space-y-1.5">
          {tips.map((t) => (
            <div key={t} className="rounded-xl bg-white/[0.06] ring-1 ring-white/8 p-2">
              <div className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-gradient-brand grid place-items-center text-[5px] font-black text-white">
                  LM
                </span>
                <span className="text-[6px] text-white/40">Love meet</span>
              </div>
              <div className="mt-1 text-[8px] font-bold text-white leading-snug">{t}</div>
              <div className="mt-0.5 text-[6px] text-white/45 leading-relaxed">
                People tell you what matters to them sideways, in the middle of…
              </div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  )
}
