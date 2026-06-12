import { useMemo, useState, Fragment } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGroupPost, type GroupPost } from '../hooks/useGroupPosts'
import { useGroupComments, useAddGroupComment, useDeleteGroupComment, type GroupComment } from '../hooks/useGroupComments'
import { useToggleGroupLike } from '../hooks/useGroupPostMutations'
import { useProfile } from '../hooks/useProfile'
import { useAuth } from '../stores/auth'
import { avatarFor, avatarUrlOr } from '../lib/avatar'
import { cloudinaryPlaceholderUrl } from '../lib/cloudinary'
import { InlineAd } from '../components/FeedAd'
import AuthorTick from '../components/AuthorTick'
import MentionTextarea from '../components/MentionTextarea'
import CommentBody from '../components/CommentBody'

export default function GroupPostDetailScreen() {
  const { slug = '', postId = '' } = useParams<{ slug: string; postId: string }>()
  const navigate = useNavigate()
  // Single Sponsored row inserted at a random 3–7 position in the comment list.
  const adAt = useMemo(() => 3 + Math.floor(Math.random() * 5), [])
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const profile = useProfile()
  const postQ = useGroupPost(postId)
  const commentsQ = useGroupComments(postId)
  const add = useAddGroupComment(slug, postId)
  const del = useDeleteGroupComment(slug, postId)
  const like = useToggleGroupLike(slug)

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<GroupComment | null>(null)
  const [rootVisible, setRootVisible] = useState(ROOTS_PAGE)

  // Build the comment tree: roots + children-by-parent for recursive render.
  const { roots, childrenOf } = useMemo(() => {
    const all = commentsQ.data ?? []
    const roots: GroupComment[] = []
    const childrenOf = new Map<string, GroupComment[]>()
    for (const c of all) {
      if (c.parent_id) {
        const arr = childrenOf.get(c.parent_id) ?? []
        arr.push(c)
        childrenOf.set(c.parent_id, arr)
      } else {
        roots.push(c)
      }
    }
    return { roots, childrenOf }
  }, [commentsQ.data])

  async function send() {
    const body = text.trim()
    if (!body || add.isPending) return
    setText('')
    try {
      await add.mutateAsync({ body, parentId: replyTo?.id ?? null })
      setReplyTo(null)
    } catch {
      setText(body)
    }
  }

  const post = postQ.data

  return (
    <div className="h-screen flex flex-col text-ink">
      <header
        className="shrink-0 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(`/g/${slug}`)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Thread</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          {/* The post (thread starter) */}
          {postQ.status === 'pending' && <div className="glass rounded-2xl h-40 animate-pulse" />}
          {post && <ThreadStarter post={post} onLike={() => like.mutate({ postId: post.id, nextLiked: !post.liked_by_me })} />}

          {/* Comments */}
          <h2 className="mt-6 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold px-1 pb-1">
            {post ? `${post.comment_count} ${post.comment_count === 1 ? 'comment' : 'comments'}` : 'Comments'}
          </h2>

          {commentsQ.status === 'pending' && (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface-3 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-surface-3 rounded animate-pulse" />
                    <div className="h-3 w-52 bg-surface-3 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {commentsQ.status === 'success' && roots.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">
              No comments yet. Start the conversation.
            </p>
          )}

          <ul>
            {roots.slice(0, rootVisible).map((c, i) => (
              <Fragment key={c.id}>
                <li>
                  <CommentNode
                    comment={c}
                    childrenOf={childrenOf}
                    myId={myId}
                    depth={0}
                    onReply={(target) => setReplyTo(target)}
                    onDelete={(id) => del.mutate(id)}
                  />
                </li>
                {i === adAt && <li><InlineAd /></li>}
              </Fragment>
            ))}
          </ul>
          {roots.length > rootVisible && (
            <button
              onClick={() => setRootVisible((v) => v + ROOTS_PAGE)}
              className="mt-3 text-[13px] font-bold text-ink-muted hover:text-rose"
            >
              View {roots.length - rootVisible} more {roots.length - rootVisible === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      </div>

      {/* Pinned composer */}
      <div
        className="shrink-0 glass border-t border-white/5 px-3 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        {replyTo && (
          <div className="mb-2 mx-1 flex items-center gap-2 text-xs text-ink-muted">
            <span className="border-l-2 border-coral pl-2">
              Replying to <span className="text-coral font-semibold">@{replyTo.author_handle ?? 'user'}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-ink">✕</button>
          </div>
        )}
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <img src={avatarFor(profile.data)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          <MentionTextarea
            value={text}
            onChange={setText}
            rows={1}
            maxLength={500}
            placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
            className="flex-1 bg-surface/60 border border-white/10 rounded-2xl px-3 py-2 outline-none text-ink text-sm placeholder:text-ink-muted resize-none min-h-9 max-h-24 focus:ring-brand no-scrollbar"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
            }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || add.isPending}
            aria-label="Send"
            className={[
              'w-9 h-9 rounded-full grid place-items-center text-sm shrink-0 transition-opacity',
              text.trim() && !add.isPending ? 'bg-gradient-brand text-white glow-rose' : 'bg-surface-3 text-ink-muted',
            ].join(' ')}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- thread starter (the post) ----------

function ThreadStarter({ post, onLike }: { post: GroupPost; onLike: () => void }) {
  return (
    <article className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <Link to={`/profile/${post.author_id}`}>
          <img src={avatarUrlOr(post.author_avatar_url)} alt="" className="w-9 h-9 rounded-full object-cover" />
        </Link>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-ink">
            @{post.author_handle ?? post.author_display_name ?? 'unknown'}
          </span>
          <span className="text-[11px] text-ink-muted">{timeAgo(post.created_at)}</span>
        </div>
      </div>

      {post.media_url && <ThreadMedia url={post.media_url} kind={post.media_kind} aspect={post.media_aspect} />}
      {post.body && (
        <p className="text-ink text-base leading-relaxed whitespace-pre-wrap break-words">{post.body}</p>
      )}

      <div className="mt-4 flex items-center gap-5 text-sm text-ink-2">
        <motion.button
          onClick={onLike}
          whileTap={{ scale: 0.85 }}
          className={`flex items-center gap-1.5 transition-colors ${post.liked_by_me ? 'text-rose' : 'hover:text-rose'}`}
        >
          <span className="text-base">{post.liked_by_me ? '❤' : '♥'}</span>
          <span>{post.like_count}</span>
        </motion.button>
        <span className="flex items-center gap-1.5 text-ink-muted">
          <span className="text-base">💬</span>
          <span>{post.comment_count}</span>
        </span>
      </div>
    </article>
  )
}

function ThreadMedia({ url, kind, aspect }: { url: string; kind: GroupPost['media_kind']; aspect: number | null }) {
  const mediaKind: 'image' | 'video' = kind === 'video' ? 'video' : 'image'
  const placeholder = cloudinaryPlaceholderUrl(url, mediaKind)
  const [loaded, setLoaded] = useState(false)
  const a = aspect && aspect > 0 ? Math.max(0.5, Math.min(aspect, 2.5)) : 1
  return (
    <div className="relative overflow-hidden rounded-xl bg-black/30 mb-3" style={{ aspectRatio: String(a) }}>
      {placeholder && <img src={placeholder} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-md" />}
      {mediaKind === 'video' ? (
        <video src={url} onLoadedData={() => setLoaded(true)} controls playsInline preload="metadata"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      ) : (
        <img src={url} onLoad={() => setLoaded(true)} alt="" loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      )}
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      )}
    </div>
  )
}

// ---------- recursive comment node with thread lines ----------

const MAX_INDENT_DEPTH = 5
const ROOTS_PAGE = 8
const THREAD_REPLIES_PAGE = 5

function CommentNode({
  comment, childrenOf, myId, depth, onReply, onDelete,
}: {
  comment: GroupComment
  childrenOf: Map<string, GroupComment[]>
  myId: string | null
  depth: number
  onReply: (c: GroupComment) => void
  onDelete: (id: string) => void
}) {
  const kids = childrenOf.get(comment.id) ?? []
  const isMine = comment.author_id === myId
  // Replies stay collapsed until the user asks to see them, then they
  // reveal in pages — keeps deep/long threads fast.
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(THREAD_REPLIES_PAGE)
  const shownKids = kids.slice(0, visible)
  const remainingKids = kids.length - shownKids.length

  return (
    <div className="pt-3">
      <div className="flex items-start gap-2.5">
        <Link to={`/profile/${comment.author_id}`} className="shrink-0">
          <img src={avatarUrlOr(comment.author_avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="glass rounded-2xl rounded-tl-sm px-3 py-2">
            <div className="text-[13px] flex items-center gap-1">
              <Link to={`/profile/${comment.author_id}`} className="font-bold text-ink hover:underline">
                @{comment.author_handle ?? comment.author_display_name ?? 'unknown'}
              </Link>
              <AuthorTick userId={comment.author_id} />
              <span className="text-ink-muted text-[10px] ml-1">{timeAgo(comment.created_at)}</span>
            </div>
            <p className="text-ink-2 text-sm mt-0.5 whitespace-pre-wrap break-words">
              <CommentBody text={comment.body} />
            </p>
          </div>
          <div className="mt-1 ml-1 flex items-center gap-4 text-[11px] font-bold text-ink-muted">
            <button onClick={() => onReply(comment)} className="hover:text-rose">Reply</button>
            {isMine && <button onClick={() => onDelete(comment.id)} className="hover:text-danger">Delete</button>}
            {kids.length > 0 && (
              <button onClick={() => setOpen((o) => !o)} className="hover:text-rose">
                {open ? 'Hide replies' : `View ${kids.length} ${kids.length === 1 ? 'reply' : 'replies'}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children, connected with a vertical thread line — collapsed until opened */}
      {open && kids.length > 0 && (
        <div
          className={[
            'border-l-2 border-white/10 pl-3 mt-1',
            depth < MAX_INDENT_DEPTH ? 'ml-4' : 'ml-1',
          ].join(' ')}
        >
          {shownKids.map((k) => (
            <CommentNode
              key={k.id}
              comment={k}
              childrenOf={childrenOf}
              myId={myId}
              depth={depth + 1}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
          {remainingKids > 0 && (
            <button
              onClick={() => setVisible((v) => v + THREAD_REPLIES_PAGE)}
              className="mt-2 text-[11px] font-bold text-ink-muted hover:text-rose"
            >
              View {remainingKids} more {remainingKids === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
