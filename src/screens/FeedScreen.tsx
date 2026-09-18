import { Link } from 'react-router-dom'
import TopIcons from '../shell/TopIcons'

/**
 * Phase 0 placeholder.
 *
 * The public post feed is gone — there is no composer and no post timeline any
 * more. The live-games slide went with it: games are moving into chat as
 * turn-based matches, so there is nothing "live" to surface here.
 *
 * Phase 2 replaces this with the people feed: profile pictures only, men see
 * women and women see men, stable per-viewer ordering with a persisted cursor.
 * Until then the tab exists so the shell's navigation stays intact.
 */
export default function FeedScreen() {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 lg:left-64 xl:right-[22rem] z-30 pointer-events-none">
        <div className="bg-gradient-to-b from-black/55 to-transparent" style={{ paddingTop: 'var(--lm-top-inset)' }}>
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/feed" className="flex items-center gap-2 lg:hidden pointer-events-auto">
              <img src="/logo.png" alt="" className="h-7 w-auto" />
              <span className="font-extrabold tracking-tight text-white text-lg drop-shadow">Meet</span>
            </Link>
            <div className="hidden lg:block" />
            <div className="pointer-events-auto">
              <TopIcons tone="light" />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed top-0 left-0 right-0 bottom-[calc(4rem_+_var(--lm-bottom-inset))] lg:left-64 lg:bottom-0 xl:right-[22rem] bg-black grid place-items-center px-8">
        <div className="text-center">
          <div className="text-5xl mb-3">👋</div>
          <p className="text-white font-semibold mb-1">People, coming soon</p>
          <p className="text-sm text-white/60">
            This is where you'll meet someone. Use{' '}
            <Link to="/search" className="text-rose font-semibold hover:underline">Search</Link>{' '}
            in the meantime.
          </p>
        </div>
      </div>
    </>
  )
}
