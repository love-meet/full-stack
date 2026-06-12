import { useMemo, useRef, useState, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { usePost } from '../hooks/usePost'
import { useToggleLike } from '../hooks/usePostMutations'
import { useComments, useReplies, type PostCommentRow } from '../hooks/useComments'
import {
  useAddComment,
  useReplyComment,
  useToggleCommentLike,
  useUpdateComment,
} from '../hooks/useCommentMutations'
import { useProfile } from '../hooks/useProfile'
import { avatarFor, avatarUrlOr } from '../lib/avatar'
import { getSurface } from '../lib/surface'
import GiftSheet from '../components/GiftSheet'
import PostMoreDropdown from '../components/PostMoreDropdown'
import CommentActionsSheet from '../components/CommentActionsSheet'
import { InlineAd } from '../components/FeedAd'
import AuthorTick from '../components/AuthorTick'
import { IconBack, IconComment, IconShare, IconMore } from '../components/icons'
import type { FeedPost } from '../hooks/useFeed'
import MentionTextarea from '../components/MentionTextarea'
import CommentBody from '../components/CommentBody'

export default function PostDetailScreen() {
  const navigate = useNavigate()
  const { postId = '' } = useParams<{ postId: string }>()
  const postQ = usePost(postId)
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const profile = useProfile()
  const [giftOpen, setGiftOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [popKey, setPopKey] = useState(0)
  const moreBtnRef = useRef<HTMLButtonElement>(null)

  const toggleLike = useToggleLike()
  const addComment = useAddComment(postId)
  const [text, setText] = useState('')

  if (postQ.status === 'pending') {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }
  if (postQ.status === 'error' || !postQ.data) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header onBack={() => navigate(-1)} />
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <div className="text-4xl mb-2">😶</div>
            <p className="text-ink font-semibold">Post not found</p>
            <p className="text-sm text-ink-muted mt-1">
              It may have been deleted, or you don't have permission to see it.
            </p>
            <Link to="/feed" className="inline-flex mt-5 rounded-full px-6 py-3 bg-gradient-brand text-white font-semibold glow-rose">
              Back to feed
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const post = postQ.data
  const isMine = myId === post.author_id

  function onLike() {
    toggleLike.mutate({ postId: post.id, nextLiked: !post.liked_by_me })
    if (!post.liked_by_me) setPopKey((k) => k + 1)
  }

  async function send() {
    const body = text.trim()
    if (!body || addComment.isPending) return
    setText('')
    try { await addComment.mutateAsync(body) }
    catch { setText(body) }
  }

  return (
    <div className="min-h-screen flex flex-col text-ink pb-28">
      <Header onBack={() => navigate(-1)} />

      <div className="max-w-xl mx-auto w-full px-5 sm:px-8 pt-4">
        {/* Post header — clickable to user profile */}
        <header className="flex items-center justify-between">
          <Link
            to={`/profile/${post.author_id}`}
            className="flex items-center gap-3 min-w-0 active:opacity-70 transition-opacity"
          >
            <img
              src={avatarUrlOr(post.author_avatar_url, post.author_gender)}
              alt=""
              className="w-12 h-12 rounded-full object-cover shrink-0"
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-sm font-bold text-ink truncate flex items-center gap-1">
                @{post.author_handle ?? post.author_display_name ?? 'unknown'}
                {post.author_is_verified && <VerifiedBadge />}
              </span>
              <span className="text-[11px] text-ink-muted">{timeAgo(post.created_at)}</span>
            </div>
          </Link>
          <div className="shrink-0">
            <button
              ref={moreBtnRef}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="text-ink-muted hover:text-ink leading-none p-2 -mr-1 rounded-full hover:bg-white/[0.06] transition-colors"
            >
              <IconMore />
            </button>
            {menuOpen && (
              <PostMoreDropdown
                post={post}
                isMine={isMine}
                anchorRef={moreBtnRef}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        </header>

        {/* Caption */}
        {post.caption && (
          <p className="mt-3 text-ink text-sm leading-relaxed whitespace-pre-wrap">
            {post.caption}
          </p>
        )}

        {/* Music Track Pill */}
        {post.audio_track_url && (
          <div className="mt-3 inline-flex items-center gap-2 bg-surface-3 pl-1 pr-3 py-1.5 rounded-full relative overflow-hidden group border border-white/5">
            {post.audio_track_cover_url ? (
              <img src={post.audio_track_cover_url} alt="" className="w-6 h-6 rounded-full object-cover relative z-10" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center text-[10px] relative z-10">🎵</div>
            )}
            <div className="flex flex-col min-w-0 pr-2 relative z-10">
              <span className="text-[11px] font-bold text-ink truncate leading-tight">{post.audio_track_title}</span>
              <span className="text-[9px] text-ink-muted truncate leading-tight">{post.audio_track_artist}</span>
            </div>
            <div className="absolute inset-0 bg-gradient-brand opacity-10" />
          </div>
        )}

        {/* Media — tap to open full-page */}
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label="View full size"
          className="mt-3 block w-full rounded-2xl overflow-hidden bg-black cursor-zoom-in"
          style={{ aspectRatio: String(post.media_aspect ?? 0.8) }}
        >
          {post.kind === 'image' ? (
            <img src={post.media_url} alt={post.alt_text ?? ''} className="w-full h-full object-cover" />
          ) : (
            <video
              src={post.media_url}
              className="w-full h-full object-cover pointer-events-none"
              playsInline
              muted
              loop
            />
          )}
        </button>

        {/* Actions */}
        <footer className="mt-2 flex items-center justify-around border-y border-white/8 py-2 px-2">
          <motion.button
            onClick={onLike}
            whileTap={{ scale: 0.9 }}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              post.liked_by_me ? 'bg-rose/15 text-rose' : 'text-ink-muted hover:text-rose',
            ].join(' ')}
          >
            <motion.span
              key={popKey}
              initial={popKey ? { scale: 1.5 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 16 }}
              className="text-base leading-none"
            >
              {post.liked_by_me ? '❤' : '♡'}
            </motion.span>
            {!post.hide_like_count && <span>{formatCount(post.like_count)}</span>}
          </motion.button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted">
            <IconComment />
            <span>{formatCount(post.comment_count)}</span>
          </div>

          <button
            onClick={() => shareToTelegram(post)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-coral transition-colors"
          >
            <IconShare />
            <span className="hidden sm:inline">Share</span>
          </button>

          {!isMine && (
            <button
              onClick={() => setGiftOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-gold transition-colors"
            >
              <span className="text-base leading-none">🎁</span>
              <span className="hidden sm:inline">
                Gift{post.gift_count > 0 ? ` ${formatCount(post.gift_count)}` : ''}
              </span>
            </button>
          )}
        </footer>

        {/* Comments inline */}
        <section className="mt-4">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1 px-1">
            Comments
          </h2>
          {!post.comments_disabled ? (
            <Comments postId={post.id} />
          ) : (
            <p className="px-1 py-3 text-sm text-ink-muted">Comments are turned off for this post.</p>
          )}
        </section>
      </div>

      {/* Composer pinned to bottom of viewport */}
      {!post.comments_disabled && (
        <div
          className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 glass border-t border-white/5 px-3 py-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <div className="max-w-xl mx-auto flex items-end gap-2">
            <img src={avatarFor(profile.data)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            <MentionTextarea
              value={text}
              onChange={setText}
              rows={1}
              maxLength={500}
              placeholder="Write a comment…"
              className="flex-1 bg-surface/60 border border-white/10 rounded-2xl px-3 py-2 outline-none text-ink text-sm placeholder:text-ink-muted resize-none min-h-9 max-h-24 focus:ring-brand"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button
              onClick={send}
              disabled={!text.trim() || addComment.isPending}
              aria-label="Send"
              className={[
                'w-9 h-9 rounded-full grid place-items-center text-sm shrink-0 transition-opacity',
                text.trim() && !addComment.isPending
                  ? 'bg-gradient-brand text-white glow-rose'
                  : 'bg-surface-3 text-ink-muted',
              ].join(' ')}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {giftOpen && (
          <GiftSheet
            postId={post.id}
            recipientId={post.author_id}
            recipientLabel={post.author_handle ?? post.author_display_name ?? 'user'}
            onClose={() => setGiftOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Full-page media viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black grid place-items-center"
            onClick={() => setViewerOpen(false)}
          >
            {post.kind === 'image' ? (
              <img
                src={post.media_url}
                alt={post.alt_text ?? ''}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <video
                src={post.media_url}
                className="max-w-full max-h-full"
                controls
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                autoPlay
                playsInline
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              onClick={() => setViewerOpen(false)}
              aria-label="Close"
              className="absolute top-5 right-5 w-10 h-10 grid place-items-center rounded-full bg-white/10 text-white text-2xl backdrop-blur"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- inline Comments list (same UX as the bottom-sheet) ----------

const COMMENTS_PAGE = 8
const REPLIES_PAGE = 5

function Comments({ postId }: { postId: string }) {
  const commentsQ = useComments(postId)
  const [visible, setVisible] = useState(COMMENTS_PAGE)
  // Drop a single Sponsored row somewhere between the 3rd and 7th comment —
  // randomised per page-load so it doesn't always land on the same spot.
  const adAt = useMemo(() => 3 + Math.floor(Math.random() * 5), [])

  if (commentsQ.status === 'pending') {
    return (
      <div className="px-1 py-3 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-3 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 bg-surface-3 rounded animate-pulse" />
              <div className="h-3 w-64 bg-surface-3 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (commentsQ.status === 'success' && commentsQ.data.length === 0) {
    return <p className="px-1 py-4 text-sm text-ink-muted">No comments yet. Be the first to comment!</p>
  }

  const all = commentsQ.data ?? []
  const shown = all.slice(0, visible)
  const remaining = all.length - shown.length

  return (
    <ul className="divide-y divide-white/[0.06]">
      {shown.map((c, i) => (
        <Fragment key={c.id}>
          <CommentRow postId={postId} comment={c} />
          {i === adAt && <li className="py-1"><InlineAd /></li>}
        </Fragment>
      ))}
      {remaining > 0 && (
        <button
          onClick={() => setVisible((v) => v + COMMENTS_PAGE)}
          className="mt-2 mb-1 text-[13px] font-bold text-ink-muted hover:text-rose"
        >
          View {remaining} more {remaining === 1 ? 'comment' : 'comments'}
        </button>
      )}
    </ul>
  )
}

function CommentRow({ postId, comment }: { postId: string; comment: PostCommentRow }) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const toggleLike = useToggleCommentLike(postId)
  const updateComment = useUpdateComment(postId)
  const [showReply, setShowReply] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const isMine = comment.author_id === myId

  async function saveEdit() {
    const next = draft.trim()
    if (!next || next === comment.body) { setEditing(false); return }
    try {
      await updateComment.mutateAsync({ commentId: comment.id, parentId: comment.parent_id, body: next })
      setEditing(false)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <li>
      <div className="flex items-start gap-3 py-3">
        <Link to={`/profile/${comment.author_id}`} className="shrink-0">
          <img
            src={avatarUrlOr(comment.author_avatar_url, comment.author_gender)}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-1">
            <Link to={`/profile/${comment.author_id}`} className="font-bold text-ink hover:underline">
              {comment.author_handle ?? comment.author_display_name ?? 'unknown'}
            </Link>
            <AuthorTick userId={comment.author_id} />
            <span className="text-ink-muted text-[11px] ml-1">{timeAgo(comment.created_at)}</span>
            <button
              onClick={() => setActionsOpen(true)}
              aria-label="Comment options"
              className="ml-auto text-ink-muted hover:text-ink text-base leading-none px-2 -mr-2 py-1"
            >
              ⋯
            </button>
          </div>

          {editing ? (
            <div className="mt-1">
              <MentionTextarea
                value={draft}
                onChange={setDraft}
                rows={2}
                maxLength={500}
                className="w-full bg-surface/60 border border-white/10 rounded-2xl px-3 py-2 outline-none text-ink text-sm placeholder:text-ink-muted resize-none focus:ring-brand"
                autoFocus
              />
              <div className="flex gap-2 justify-end mt-1.5">
                <button
                  onClick={() => { setEditing(false); setDraft(comment.body) }}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold glass text-ink-2 hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!draft.trim() || updateComment.isPending}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold bg-gradient-brand text-white glow-rose disabled:opacity-60"
                >
                  {updateComment.isPending ? '…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-ink-2 text-sm mt-0.5 whitespace-pre-wrap break-words">
              <CommentBody text={comment.body} />
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-4 text-[11px] font-bold text-ink-muted">
            <button onClick={() => setShowReply((s) => !s)} className="hover:text-rose">Reply</button>
            {comment.reply_count > 0 && (
              <button onClick={() => setShowReplies((s) => !s)} className="hover:text-rose">
                {showReplies ? 'Hide' : 'View'} {comment.reply_count}{' '}
                {comment.reply_count > 1 ? 'replies' : 'reply'}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => toggleLike.mutate({
            commentId: comment.id,
            parentId: comment.parent_id,
            nextLiked: !comment.liked_by_me,
          })}
          className="shrink-0 px-2 py-1 grid place-items-center"
          aria-label="Like comment"
        >
          <span className={comment.liked_by_me ? 'text-rose text-base' : 'text-ink-muted text-base'}>
            {comment.liked_by_me ? '❤' : '♡'}
          </span>
          {comment.like_count > 0 && (
            <span className="text-[10px] text-ink-muted mt-0.5">{comment.like_count}</span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {showReply && (
          <ReplyComposer
            postId={postId}
            parentId={comment.id}
            recipientLabel={comment.author_handle ?? comment.author_display_name ?? 'comment'}
            onDone={() => { setShowReply(false); setShowReplies(true) }}
          />
        )}
      </AnimatePresence>

      {showReplies && <Replies postId={postId} parentId={comment.id} />}

      <AnimatePresence>
        {actionsOpen && (
          <CommentActionsSheet
            postId={postId}
            comment={comment}
            isMine={isMine}
            onClose={() => setActionsOpen(false)}
            onEdit={() => { setEditing(true); setDraft(comment.body) }}
            onReply={() => setShowReply(true)}
          />
        )}
      </AnimatePresence>
    </li>
  )
}

function ReplyComposer({
  postId, parentId, recipientLabel, onDone,
}: { postId: string; parentId: string; recipientLabel: string; onDone: () => void }) {
  const profile = useProfile()
  const reply = useReplyComment(postId, parentId)
  const [text, setText] = useState('')
  const canSend = text.trim().length > 0 && !reply.isPending

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="pl-[52px] pb-3"
    >
      <div className="flex items-end gap-2">
        <img src={avatarFor(profile.data)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        <MentionTextarea
          value={text}
          onChange={setText}
          rows={1}
          maxLength={500}
          placeholder={`Replying to ${recipientLabel}…`}
          className="flex-1 bg-surface/60 border border-white/10 rounded-2xl px-3 py-1.5 outline-none text-ink text-sm placeholder:text-ink-muted resize-none focus:ring-brand"
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!canSend) return
              const body = text.trim()
              setText('')
              try { await reply.mutateAsync(body); onDone() }
              catch (err) { alert((err as Error).message); setText(body) }
            }
          }}
          autoFocus
        />
        <button
          onClick={async () => {
            if (!canSend) return
            const body = text.trim()
            setText('')
            try { await reply.mutateAsync(body); onDone() }
            catch (err) { alert((err as Error).message); setText(body) }
          }}
          disabled={!canSend}
          aria-label="Send reply"
          className={[
            'w-8 h-8 rounded-full grid place-items-center text-xs shrink-0 transition-opacity',
            canSend ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
          ].join(' ')}
        >
          ➤
        </button>
      </div>
    </motion.div>
  )
}

function Replies({ postId, parentId }: { postId: string; parentId: string }) {
  const repliesQ = useReplies(parentId, true)
  const [visible, setVisible] = useState(REPLIES_PAGE)
  if (repliesQ.status === 'pending') {
    return (
      <div className="pl-[52px] pb-3">
        <div className="h-3 w-32 bg-surface-3 rounded animate-pulse" />
      </div>
    )
  }
  const all = repliesQ.data ?? []
  const shown = all.slice(0, visible)
  const remaining = all.length - shown.length
  return (
    /* Wired replies: a connector line runs down the left of the reply
       group, visually tying them to the parent comment. */
    <ul className="ml-5 pl-4 border-l-2 border-white/10 divide-y divide-white/[0.05]">
      {shown.map((r) => <CommentRow key={r.id} postId={postId} comment={r} />)}
      {remaining > 0 && (
        <button
          onClick={() => setVisible((v) => v + REPLIES_PAGE)}
          className="mt-2 mb-2 text-[12px] font-bold text-ink-muted hover:text-rose"
        >
          View {remaining} more {remaining === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </ul>
  )
}

// ---------- header / helpers ----------

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header
      className="sticky top-0 z-20 glass border-b border-white/5"
      style={{ paddingTop: 'var(--lm-top-inset)' }}
    >
      <div className="max-w-xl mx-auto h-14 px-3 flex items-center">
        <button
          onClick={onBack}
          aria-label="Back"
          className="text-ink-2 hover:text-ink p-2 rounded-full hover:bg-white/[0.06] transition-colors"
        >
          <IconBack />
        </button>
        <div className="flex-1 text-center text-ink font-bold">Post</div>
        <div className="w-10" aria-hidden />
      </div>
    </header>
  )
}

function VerifiedBadge() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-label="Verified" className="text-gold shrink-0">
      <path fill="currentColor" d="M10 1.2l2 1.6 2.5-.3.7 2.4 2.3 1-.4 2.5 1.4 2.1-1.6 2 .3 2.5-2.4.7-1 2.3-2.5-.4-2.1 1.4-2-1.6-2.5.3-.7-2.4-2.3-1 .4-2.5L.6 9.4 2.2 7.4 2 5l2.4-.7 1-2.3 2.5.4z" />
      <path fill="#070A16" d="M8.5 12.2l-2-2 1.1-1.1 1 1 3.2-3.3 1.1 1.1z" />
    </svg>
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
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / 86400 / 7)}w`
}

function shareToTelegram(post: FeedPost) {
  const url = `${window.location.origin}/p/${post.id}`
  const text = post.caption
    ? `“${post.caption.slice(0, 100)}” — @${post.author_handle ?? 'someone'} on Love meet`
    : `Look at this on Love meet`
  if (getSurface() === 'telegram' && window.Telegram?.WebApp) {
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    const wa = window.Telegram.WebApp as unknown as { openTelegramLink?: (s: string) => void }
    if (wa.openTelegramLink) { wa.openTelegramLink(share); return }
  }
  if (navigator.share) { void navigator.share({ url, text }).catch(() => {}); return }
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
}
