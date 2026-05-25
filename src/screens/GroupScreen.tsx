import { useState } from 'react'
import { Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { stagger, itemUp } from '../shell/motion'
import { useGroup } from '../hooks/useGroups'
import { useGroupPosts, type GroupPost } from '../hooks/useGroupPosts'
import { useGroupPostsRealtime } from '../hooks/useGroupPostsRealtime'
import { useToggleGroupLike, useModerateGroupPost } from '../hooks/useGroupPostMutations'
import { useIsAdmin } from '../hooks/useAdmin'
import { useJoinGroup, useLeaveGroup } from '../hooks/useGroupMembership'
import { useAuth } from '../stores/auth'
import { avatarUrlOr } from '../lib/avatar'
import { cloudinaryPlaceholderUrl } from '../lib/cloudinary'
import GroupComposer from '../components/groups/GroupComposer'

export default function GroupScreen() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const groupQ = useGroup(slug)
  const posts = useGroupPosts(slug)
  useGroupPostsRealtime(slug)
  const join = useJoinGroup()
  const leave = useLeaveGroup()
  const [composerOpen, setComposerOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [pendingOnly, setPendingOnly] = useState(false)
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const platformAdmin = useIsAdmin()

  const group = groupQ.data
  // Moderators = platform admins (covers the official rooms) or this
  // group's owner/admins. Mirrors the server-side is_group_admin().
  const canModerate = platformAdmin || group?.my_role === 'owner' || group?.my_role === 'admin'
  const allLoaded = posts.data?.pages.flat() ?? []
  const pendingCount = allLoaded.filter((p) => p.status === 'pending' && p.author_id !== myId).length

  if (groupQ.status === 'pending') {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }
  if (!group) {
    return (
      <div className="min-h-screen flex flex-col">
        <SimpleHeader title="Group" onBack={() => navigate('/explore')} />
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <div className="text-4xl mb-2">🫥</div>
            <p className="text-ink font-semibold">Group not found</p>
            <Link to="/explore" className="inline-flex mt-5 rounded-full px-6 py-3 bg-gradient-brand text-white font-semibold glow-rose">
              Back to Explore
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const headerRight = canModerate ? (
    <button
      onClick={() => navigate(`/g/${slug}/manage`)}
      aria-label="Manage group"
      className="text-ink-2 hover:text-ink text-xl leading-none px-2 py-2"
    >
      ⚙
    </button>
  ) : !group.is_default && !group.is_member ? (
    <button
      onClick={() => join.mutate(group.id)}
      disabled={join.isPending}
      className="rounded-full px-3 py-1.5 text-xs font-bold bg-gradient-brand text-white glow-rose disabled:opacity-60"
    >
      {join.isPending ? '…' : 'Join'}
    </button>
  ) : !group.is_default && group.is_member ? (
    <button
      onClick={() => {
        if (window.confirm(`Leave ${group.name}?`)) leave.mutate(group.id)
      }}
      disabled={leave.isPending}
      className="rounded-full px-3 py-1.5 text-xs font-bold glass text-ink-2 hover:text-ink disabled:opacity-60"
    >
      Joined ✓
    </button>
  ) : null

  return (
    <div className="min-h-screen text-ink">
      <SimpleHeader title={group.name} onBack={() => navigate('/explore')} right={headerRight} />

      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-4 pb-28">
        {/* Welcome banner (dismissible) */}
        {group.welcome_message && showWelcome && (
          <div className="glass rounded-2xl p-4 flex items-start gap-3 border border-rose/20">
            <span className="text-xl shrink-0">👋</span>
            <p className="flex-1 text-sm text-ink-2">{group.welcome_message}</p>
            <button
              onClick={() => setShowWelcome(false)}
              aria-label="Dismiss"
              className="text-ink-muted hover:text-ink text-base"
            >
              ✕
            </button>
          </div>
        )}

        {/* Moderation banner */}
        {canModerate && pendingCount > 0 && (
          <button
            onClick={() => setPendingOnly((v) => !v)}
            className="mt-3 w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 text-left border border-gold/30"
          >
            <span className="text-xl">🛡</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink">
                {pendingCount} post{pendingCount === 1 ? '' : 's'} awaiting review
              </div>
              <div className="text-[11px] text-ink-muted">
                {pendingOnly ? 'Showing pending only — tap to show all' : 'Tap to review just the pending ones'}
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-gold">
              {pendingOnly ? 'Filtered' : 'Review'}
            </span>
          </button>
        )}

        {/* Feed */}
        <div className="mt-5">
          {posts.status === 'pending' && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-32 animate-pulse" />
              ))}
            </div>
          )}

          {posts.status === 'success' && posts.data?.pages.every((p) => p.length === 0) && (
            <div className="glass rounded-3xl p-8 text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-ink font-semibold mb-1">Nothing here yet</p>
              <p className="text-sm text-ink-muted">Be the first to post in {group.name}.</p>
            </div>
          )}

          <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="visible">
            {posts.data?.pages.map((page, i) => (
              <Fragment key={i}>
                {page
                  .filter((post) => (pendingOnly ? post.status === 'pending' : true))
                  .map((post) => (
                    <motion.div key={post.id} variants={itemUp}>
                      <GroupPostCard
                        post={post}
                        slug={slug}
                        canModerate={canModerate}
                        onOpenComments={() => navigate(`/g/${slug}/p/${post.id}`)}
                      />
                    </motion.div>
                  ))}
              </Fragment>
            ))}
            {posts.hasNextPage && (
              <button
                onClick={() => posts.fetchNextPage()}
                disabled={posts.isFetchingNextPage}
                className="w-full glass rounded-full py-3 text-sm font-semibold text-ink-2 hover:text-rose transition-colors disabled:opacity-60"
              >
                {posts.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </motion.div>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setComposerOpen(true)}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-20 rounded-full w-14 h-14 bg-gradient-brand text-white text-2xl glow-rose grid place-items-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="New post"
      >
        +
      </button>

      <AnimatePresence>
        {composerOpen && (
          <GroupComposer
            groupId={group.id}
            groupSlug={group.slug}
            groupName={group.name}
            onClose={() => setComposerOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- post card ----------

function GroupPostCard({
  post, slug, canModerate, onOpenComments,
}: { post: GroupPost; slug: string; canModerate: boolean; onOpenComments: () => void }) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const toggle = useToggleGroupLike(slug)
  const moderate = useModerateGroupPost(slug)
  const [popKey, setPopKey] = useState(0)
  const isMine = post.author_id === myId
  const showModeration = canModerate && post.status === 'pending'

  function onLike() {
    toggle.mutate({ postId: post.id, nextLiked: !post.liked_by_me })
    if (!post.liked_by_me) setPopKey((k) => k + 1)
  }

  function reject() {
    const reason = window.prompt('Reason for rejecting (optional, shown to the author):') ?? undefined
    moderate.mutate({ postId: post.id, action: 'reject', reason })
  }

  return (
    <article className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <Link to={`/profile/${post.author_id}`}>
          <img src={avatarUrlOr(post.author_avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
        </Link>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-sm font-semibold text-ink truncate">
            @{post.author_handle ?? post.author_display_name ?? 'unknown'}
          </span>
          <span className="text-[11px] text-ink-muted">{timeAgo(post.created_at)}</span>
        </div>
        {post.status !== 'approved' && (isMine || canModerate) && (
          <span
            className={[
              'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
              post.status === 'pending' ? 'bg-gold/15 text-gold' : 'bg-danger/15 text-danger',
            ].join(' ')}
          >
            {post.status === 'pending' ? 'Pending review' : 'Rejected'}
          </span>
        )}
      </div>

      {post.media_url && <GroupMedia url={post.media_url} kind={post.media_kind} aspect={post.media_aspect} />}

      {post.body && (
        <p className="text-ink text-base leading-relaxed whitespace-pre-wrap break-words">
          {post.body}
        </p>
      )}

      <div className="mt-4 flex items-center gap-5 text-sm text-ink-2">
        <motion.button
          onClick={onLike}
          whileTap={{ scale: 0.85 }}
          className={`flex items-center gap-1.5 transition-colors ${post.liked_by_me ? 'text-rose' : 'hover:text-rose'}`}
        >
          <motion.span
            key={popKey}
            initial={popKey ? { scale: 1.5 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            className="text-base"
          >
            {post.liked_by_me ? '❤' : '♥'}
          </motion.span>
          <span>{formatCount(post.like_count)}</span>
        </motion.button>
        <button
          onClick={onOpenComments}
          className="flex items-center gap-1.5 hover:text-magenta transition-colors"
        >
          <span className="text-base">💬</span>
          <span>{formatCount(post.comment_count)}</span>
        </button>
      </div>

      {/* Moderation actions (pending posts, moderators only) */}
      {showModeration && (
        <div className="mt-4 pt-3 border-t border-white/5 flex gap-2 justify-end">
          <button
            onClick={reject}
            disabled={moderate.isPending}
            className="rounded-full px-4 py-1.5 text-xs font-bold glass text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            onClick={() => moderate.mutate({ postId: post.id, action: 'approve' })}
            disabled={moderate.isPending}
            className="rounded-full px-4 py-1.5 text-xs font-bold bg-success text-white disabled:opacity-60"
          >
            Approve
          </button>
        </div>
      )}
    </article>
  )
}

function GroupMedia({
  url, kind, aspect,
}: { url: string; kind: GroupPost['media_kind']; aspect: number | null }) {
  const mediaKind: 'image' | 'video' = kind === 'video' ? 'video' : 'image'
  const placeholder = cloudinaryPlaceholderUrl(url, mediaKind)
  const [loaded, setLoaded] = useState(false)
  const a = aspect && aspect > 0 ? Math.max(0.5, Math.min(aspect, 2.5)) : 1

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-black/30 mb-3"
      style={{ aspectRatio: String(a) }}
    >
      {placeholder && (
        <img src={placeholder} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-md" />
      )}
      {mediaKind === 'video' ? (
        <video
          src={url}
          onLoadedData={() => setLoaded(true)}
          controls
          playsInline
          preload="metadata"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <img
          src={url}
          onLoad={() => setLoaded(true)}
          alt=""
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      )}
    </div>
  )
}

// ---------- header + helpers ----------

function SimpleHeader({
  title, onBack, right,
}: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-10 glass border-b border-white/5"
      style={{ paddingTop: 'var(--lm-top-inset)' }}
    >
      <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
        <button onClick={onBack} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
        <div className="flex-1 text-center text-ink font-bold truncate px-2">{title}</div>
        <div className="min-w-10 flex justify-end">{right}</div>
      </div>
    </header>
  )
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'k'
  return (n / 1_000_000).toFixed(1) + 'm'
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
