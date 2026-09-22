import { Link } from 'react-router-dom'
import TopIcons from '../shell/TopIcons'
import { useFriends, useFriendsPosts, type Friend } from '../hooks/useFriends'
import { avatarUrlOr } from '../lib/avatar'
import { isVideoUrl, compactCount } from '../lib/media'
import type { FeedPost } from '../hooks/useFeed'

/**
 * Friends — the second tab, where Search used to sit.
 *
 * "Friend" means you follow each other: two rows in public.follows pointing
 * back at one another. The tab shows what those people posted, with a strip of
 * their faces across the top to jump into any one of them.
 *
 * This is not the public post feed §1 removed — there is no discovery here and
 * no ranking. Nobody appears unless you both chose each other.
 *
 * Search keeps its route (/search); it just no longer owns a tab.
 */
export default function FriendsScreen() {
  const friends = useFriends()
  const posts = useFriendsPosts()

  const list = friends.data ?? []
  const feed = posts.data?.pages.flat() ?? []
  const noFriends = friends.status === 'success' && list.length === 0
  const noPosts = posts.status === 'success' && feed.length === 0

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="font-extrabold text-lg tracking-tight">
            Friends
            {list.length > 0 && (
              <span className="ml-2 text-sm font-bold text-ink-muted tabular-nums">{list.length}</span>
            )}
          </h1>
          <TopIcons />
        </div>
      </header>

      {/* The faces, across the top. Horizontal so it stays one row however
          many friends you have, and never pushes their posts off screen. */}
      {list.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
            {list.map((f) => <FriendChip key={f.id} friend={f} />)}
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-5">
        {noFriends && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-5xl mb-3">🤝</div>
            <p className="font-semibold mb-1">No friends yet</p>
            <p className="text-sm text-ink-2 leading-relaxed">
              Tap <b className="text-ink">+</b> on someone's picture in your{' '}
              <Link to="/feed" className="text-rose font-semibold hover:underline">feed</Link>{' '}
              to follow them. When they follow you back, you're friends and
              their posts show up here.
            </p>
          </div>
        )}

        {!noFriends && noPosts && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">🌱</div>
            <p className="font-semibold mb-1">Nothing posted yet</p>
            <p className="text-sm text-ink-2">
              Your friends haven't posted anything. Tap one of them above to
              open their profile.
            </p>
          </div>
        )}

        {posts.status === 'pending' && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-3xl h-72 bg-white/8 animate-pulse" />
            ))}
          </div>
        )}

        {posts.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
            {(posts.error as Error).message}
          </div>
        )}

        <div className="space-y-4">
          {feed.map((p) => <FriendPost key={p.id} post={p} />)}
        </div>

        {posts.hasNextPage && (
          <button
            onClick={() => posts.fetchNextPage()}
            disabled={posts.isFetchingNextPage}
            className="mt-5 w-full glass rounded-full py-3 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            {posts.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </button>
        )}
      </main>
    </div>
  )
}

function FriendChip({ friend: f }: { friend: Friend }) {
  const name = f.display_name ?? f.handle ?? 'Someone'
  return (
    <Link to={`/profile/${f.id}`} className="shrink-0 w-16 text-center">
      <img
        src={avatarUrlOr(f.avatar_url, f.gender)}
        alt=""
        className="w-16 h-16 rounded-full object-cover ring-2 ring-rose/70 p-0.5"
      />
      <span className="mt-1 block text-[11px] font-semibold text-ink-2 truncate">{name}</span>
    </Link>
  )
}

function FriendPost({ post: p }: { post: FeedPost }) {
  const name = p.author_display_name ?? p.author_handle ?? 'Someone'
  return (
    <article className="glass rounded-3xl overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <Link to={`/profile/${p.author_id}`}>
          <img
            src={avatarUrlOr(p.author_avatar_url, p.author_gender)}
            alt=""
            className="w-9 h-9 rounded-full object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/profile/${p.author_id}`} className="block text-sm font-bold truncate">
            {name}
          </Link>
          <span className="block text-[11px] text-ink-muted">
            {new Date(p.created_at).toLocaleDateString()}
          </span>
        </div>
      </header>

      <Link to={`/p/${p.id}`} className="block bg-black">
        {isVideoUrl(p.media_url) || p.kind === 'short_video' ? (
          <video
            src={p.media_url}
            className="w-full max-h-[70vh] object-contain"
            muted
            loop
            playsInline
            preload="metadata"
            controls
          />
        ) : (
          <img
            src={p.media_url}
            alt={p.alt_text ?? ''}
            className="w-full max-h-[70vh] object-contain"
          />
        )}
      </Link>

      {p.caption && (
        <p className="px-4 pt-3 text-sm text-ink-2 whitespace-pre-wrap break-words">{p.caption}</p>
      )}

      <div className="px-4 py-3 flex items-center gap-5 text-[13px] font-bold text-ink-muted">
        {!p.hide_like_count && <span>♥ {compactCount(p.like_count)}</span>}
        {!p.comments_disabled && (
          <Link to={`/p/${p.id}`}>💬 {compactCount(p.comment_count)}</Link>
        )}
        {p.gift_count > 0 && <span>🎁 {compactCount(p.gift_count)}</span>}
      </div>
    </article>
  )
}
