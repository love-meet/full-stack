import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import {
  useProfileComments,
  useAddProfileComment,
  useDeleteProfileComment,
  useToggleCommentLike,
  type ProfileComment,
} from '../hooks/useProfileActions'
import { avatarUrlOr } from '../lib/avatar'

/**
 * Comments on a person.
 *
 * The post version of this sheet is keyed to a post, and there is no post
 * feed any more (§1), so this is the profile-targeted twin: same drawer, same
 * composer, a person on the other end instead of a post.
 */
export default function ProfileCommentSheet({
  profileId, profileLabel, onClose,
}: {
  profileId: string
  profileLabel: string
  onClose: () => void
}) {
  useDrawerLock()
  const comments = useProfileComments(profileId)
  const add = useAddProfileComment(profileId)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = comments.data ?? []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || add.isPending) return
    setError(null)
    try {
      await add.mutateAsync(text)
      setBody('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose() }} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-xl bg-surface-2 rounded-t-3xl flex flex-col outline-none"
          style={{ height: '85dvh' }}
        >
          <div className="pt-3 pb-2 shrink-0">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>
          <Drawer.Title className="px-5 pb-3 shrink-0 text-lg font-extrabold text-ink">
            Comments
            {list.length > 0 && (
              <span className="ml-2 text-sm font-bold text-ink-muted tabular-nums">{list.length}</span>
            )}
          </Drawer.Title>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
            {comments.status === 'pending' && (
              <>{Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-white/6 animate-pulse" />
              ))}</>
            )}

            {comments.status === 'error' && (
              <p className="text-sm text-danger text-center py-6">
                {(comments.error as Error).message}
              </p>
            )}

            {comments.status === 'success' && list.length === 0 && (
              <p className="text-sm text-ink-muted text-center py-10">
                Nothing yet. Say something to @{profileLabel}.
              </p>
            )}

            {list.map((c) => <Row key={c.id} comment={c} profileId={profileId} />)}
          </div>

          <form
            onSubmit={submit}
            className="shrink-0 border-t border-white/8 p-3 flex items-center gap-2"
            style={{ paddingBottom: 'calc(0.75rem + var(--lm-bottom-inset))' }}
          >
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              placeholder={`Comment on @${profileLabel}…`}
              className="flex-1 rounded-full px-4 py-2.5 bg-surface/60 text-sm text-ink placeholder:text-ink-muted outline-none focus:ring-1 focus:ring-rose/60"
            />
            <button
              type="submit"
              disabled={!body.trim() || add.isPending}
              className="rounded-full px-5 py-2.5 bg-gradient-brand text-white text-sm font-extrabold disabled:opacity-40"
            >
              {add.isPending ? '…' : 'Post'}
            </button>
          </form>
          {error && <p className="px-4 pb-3 text-xs text-danger text-center">{error}</p>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function Row({ comment: c, profileId }: { comment: ProfileComment; profileId: string }) {
  const like = useToggleCommentLike(profileId)
  const del = useDeleteProfileComment(profileId)
  const name = c.display_name ?? c.handle ?? 'Someone'

  return (
    <div className="flex gap-2.5">
      <Link to={`/profile/${c.author_id}`} className="shrink-0">
        <img
          src={avatarUrlOr(c.avatar_url, null)}
          alt=""
          className="w-9 h-9 rounded-full object-cover"
        />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl bg-surface/60 px-3.5 py-2">
          <Link to={`/profile/${c.author_id}`} className="text-xs font-bold text-ink">
            {name}
          </Link>
          <p className="text-sm text-ink-2 break-words whitespace-pre-wrap">{c.body}</p>
        </div>
        <div className="flex items-center gap-4 px-2 pt-1 text-[11px] font-semibold text-ink-muted">
          <button onClick={() => like.mutate(c.id)} className={c.liked_by_me ? 'text-rose' : ''}>
            {c.liked_by_me ? '♥' : '♡'} {c.like_count > 0 ? c.like_count : 'Like'}
          </button>
          <span>{new Date(c.created_at).toLocaleDateString()}</span>
          {c.can_delete && (
            <button onClick={() => del.mutate(c.id)} disabled={del.isPending}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}
