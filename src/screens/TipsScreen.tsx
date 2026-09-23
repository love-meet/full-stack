import { useState } from 'react'
import { Link } from 'react-router-dom'
import TopIcons from '../shell/TopIcons'
import {
  useTopics, useTopicReplies, useCreateTopic, useReplyToTopic, useDeleteTopic,
  type Topic, type TopicKind,
} from '../hooks/useTopics'
import { avatarUrlOr } from '../lib/avatar'

/**
 * Tips and topics (HS-LM-v1 §01, §05).
 *
 * "The reason to open the app on a day when nobody new has appeared, and the
 * thing that makes this more than a dating app."
 *
 * Tips open first. Somebody arriving here with nothing to say should find
 * something to read before they find an empty box asking them for a
 * contribution — that ordering is the difference between a section that gets
 * used and one that looks abandoned.
 */
export default function TipsScreen() {
  const [tab, setTab] = useState<TopicKind>('tip')
  const list = useTopics(tab)
  const [composing, setComposing] = useState(false)

  const items = list.data ?? []

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="font-extrabold text-lg tracking-tight">Tips</h1>
          <TopIcons />
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-2">
          {(['tip', 'topic'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-bold transition-colors',
                tab === k ? 'bg-gradient-brand text-white' : 'glass text-ink-2',
              ].join(' ')}
            >
              {k === 'tip' ? 'Advice' : 'Topics'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {tab === 'topic' && (
          <button
            onClick={() => setComposing(true)}
            className="w-full glass rounded-2xl px-4 py-3.5 text-left text-sm text-ink-muted"
          >
            Ask something, or start a conversation…
          </button>
        )}

        {list.status === 'pending' && (
          <>{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-28 animate-pulse" />
          ))}</>
        )}

        {list.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
            {(list.error as Error).message}
          </div>
        )}

        {list.status === 'success' && items.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center">
            <p className="font-semibold mb-1">Nothing here yet</p>
            <p className="text-sm text-ink-2">
              {tab === 'tip'
                ? 'Advice is on the way.'
                : 'Be the first to ask something.'}
            </p>
          </div>
        )}

        {items.map((t) => <TopicCard key={t.id} topic={t} />)}
      </main>

      {composing && <Composer onClose={() => setComposing(false)} />}
    </div>
  )
}

function TopicCard({ topic: t }: { topic: Topic }) {
  const [open, setOpen] = useState(false)
  const replies = useTopicReplies(t.id, open)
  const reply = useReplyToTopic(t.id)
  const del = useDeleteTopic()
  const [text, setText] = useState('')

  const isTip = t.kind === 'tip'
  const author = t.display_name ?? t.handle ?? 'Love meet'

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || reply.isPending) return
    setText('')
    try { await reply.mutateAsync(body) } catch { setText(body) }
  }

  return (
    <article className="glass rounded-2xl p-4">
      <header className="flex items-center gap-2.5">
        {isTip ? (
          <span className="w-8 h-8 rounded-full grid place-items-center bg-gradient-brand text-white text-xs font-extrabold shrink-0">
            LM
          </span>
        ) : (
          <Link to={`/profile/${t.author_id}`} className="shrink-0">
            <img src={avatarUrlOr(t.avatar_url, null)} alt="" className="w-8 h-8 rounded-full object-cover" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-ink truncate">{author}</span>
          <span className="block text-[11px] text-ink-muted">
            {new Date(t.created_at).toLocaleDateString()}
          </span>
        </div>
        {t.is_mine && (
          <button
            onClick={() => del.mutate(t.id)}
            disabled={del.isPending}
            className="text-[11px] font-bold text-ink-muted hover:text-danger"
          >
            Delete
          </button>
        )}
      </header>

      <h2 className="mt-2.5 font-extrabold text-ink leading-snug">{t.title}</h2>
      <p className="mt-1 text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">{t.body}</p>

      {/* Tips are read-only; topics are the half anyone can contribute to. */}
      {!isTip && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 text-[13px] font-bold text-ink-muted hover:text-rose"
          >
            {t.reply_count > 0
              ? `${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'}`
              : 'Reply'}
          </button>

          {open && (
            <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
              {(replies.data ?? []).map((r) => (
                <div key={r.id} className="flex gap-2.5">
                  <Link to={`/profile/${r.author_id}`} className="shrink-0">
                    <img src={avatarUrlOr(r.avatar_url, null)} alt="" className="w-7 h-7 rounded-full object-cover" />
                  </Link>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold text-ink">
                      {r.display_name ?? r.handle ?? 'Someone'}
                    </span>
                    <p className="text-sm text-ink-2 break-words whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              ))}

              <form onSubmit={send} className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  placeholder="Say something…"
                  className="flex-1 rounded-full px-4 py-2 bg-surface/60 text-sm text-ink placeholder:text-ink-muted outline-none focus:ring-1 focus:ring-rose/60"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || reply.isPending}
                  className="rounded-full px-4 py-2 bg-gradient-brand text-white text-xs font-extrabold disabled:opacity-40"
                >
                  {reply.isPending ? '…' : 'Post'}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function Composer({ onClose }: { onClose: () => void }) {
  const create = useCreateTopic()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (create.isPending) return
    setError(null)
    try {
      await create.mutateAsync({ title: title.trim(), body: body.trim() })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-end sm:place-items-center">
      <form
        onSubmit={submit}
        className="w-full sm:max-w-lg bg-surface-2 rounded-t-3xl sm:rounded-3xl p-5"
        style={{ paddingBottom: 'calc(1.25rem + var(--lm-bottom-inset))' }}
      >
        <h2 className="font-extrabold text-ink">Start a topic</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Your friends will hear that you posted.
        </p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          placeholder="What is it about?"
          className="mt-4 w-full rounded-2xl px-4 py-3 bg-surface/60 text-sm font-semibold text-ink placeholder:text-ink-muted outline-none focus:ring-1 focus:ring-rose/60"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Say more…"
          className="mt-2 w-full rounded-2xl px-4 py-3 bg-surface/60 text-sm text-ink placeholder:text-ink-muted outline-none resize-none focus:ring-1 focus:ring-rose/60"
        />

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full py-3 glass text-sm font-semibold text-ink-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={title.trim().length < 3 || !body.trim() || create.isPending}
            className="flex-1 rounded-full py-3 bg-gradient-brand text-white text-sm font-extrabold disabled:opacity-50"
          >
            {create.isPending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
