import { Link, useNavigate } from 'react-router-dom'
import TopIcons from '../shell/TopIcons'
import { useSavedProfiles, useToggleProfileBookmark } from '../hooks/useProfileActions'
import { ageFrom } from '../hooks/usePeopleFeed'
import { avatarUrlOr } from '../lib/avatar'

/**
 * The people you saved from the feed.
 *
 * Private by design: saving does not notify the person and does not count as
 * a like. It is a bookmark — "come back to this one" — which is exactly why it
 * needed its own list rather than being folded into Interested.
 */
export default function SavedScreen() {
  const navigate = useNavigate()
  const saved = useSavedProfiles()
  const unsave = useToggleProfileBookmark()
  const list = saved.data ?? []

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center font-bold">Saved</div>
          <TopIcons />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {saved.status === 'pending' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-white/8 animate-pulse" />
            ))}
          </div>
        )}

        {saved.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
            {(saved.error as Error).message}
          </div>
        )}

        {saved.status === 'success' && list.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-5xl mb-3">🔖</div>
            <p className="font-semibold mb-1">Nothing saved yet</p>
            <p className="text-sm text-ink-2">
              Tap <b className="text-ink">Save</b> on anyone in your{' '}
              <Link to="/feed" className="text-rose font-semibold hover:underline">feed</Link>{' '}
              to keep them here. They are never told.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((p) => {
            const name = p.display_name ?? p.handle ?? 'Someone'
            const age = ageFrom(p.dob)
            return (
              <div key={p.id} className="relative rounded-2xl overflow-hidden bg-black/40">
                <Link to={`/profile/${p.id}`} className="block aspect-[3/4]">
                  <img src={avatarUrlOr(p.avatar_url, p.gender)} alt="" className="w-full h-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 to-transparent" />
                  <span className="absolute left-2.5 bottom-2.5 right-2.5 text-white font-bold text-sm truncate drop-shadow">
                    {name}{age != null && <span className="font-semibold text-white/75"> {age}</span>}
                  </span>
                </Link>
                <button
                  onClick={() => unsave.mutate(p.id)}
                  aria-label={`Remove ${name} from saved`}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white grid place-items-center text-sm"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
