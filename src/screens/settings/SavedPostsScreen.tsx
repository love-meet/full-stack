import { Link, useNavigate } from 'react-router-dom'
import { useBookmarkedPosts } from '../../hooks/useBookmarkedPosts'

export default function SavedPostsScreen() {
  const navigate = useNavigate()
  const saved = useBookmarkedPosts()

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Saved posts</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        {saved.status === 'pending' && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-xl aspect-square animate-pulse" />
            ))}
          </div>
        )}

        {saved.status === 'success' && saved.data.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-ink-muted">
            <div className="text-4xl mb-2">🔖</div>
            <p className="text-sm">No saved posts yet. Tap the bookmark on a post to keep it here.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {saved.data?.map((p) => (
            <Link
              key={p.id}
              to={`/p/${p.id}`}
              className="relative aspect-square rounded-xl overflow-hidden bg-surface-3 group"
            >
              {p.media_url ? (
                p.kind === 'video' ? (
                  <video src={p.media_url} className="w-full h-full object-cover" muted playsInline />
                ) : (
                  <img src={p.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )
              ) : (
                <div className="w-full h-full grid place-items-center p-2 text-[11px] text-ink-muted text-center">
                  {p.caption?.slice(0, 60) ?? 'Post'}
                </div>
              )}
              {p.kind === 'video' && (
                <span className="absolute top-1.5 right-1.5 text-white text-xs drop-shadow">▶</span>
              )}
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
