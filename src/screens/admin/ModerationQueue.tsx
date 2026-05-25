import { Link } from 'react-router-dom'
import {
  useOpenReports,
  useResolveReport,
  usePendingThreads,
  useModeratePendingThread,
  type PostReport,
} from '../../hooks/useAdmin'
import type { GroupPost } from '../../hooks/useGroupPosts'

export default function ModerationQueue() {
  const reports = useOpenReports()

  return (
    <div className="space-y-8">
      <PendingThreads />

      <section><h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">Reported posts</h2>
      {reports.status === 'pending' && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      )}

      {reports.status === 'success' && reports.data.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-ink-muted">
          <div className="text-4xl mb-2">✓</div>
          <p>No open reports. Inbox zero.</p>
        </div>
      )}

      <ul className="space-y-2">
        {reports.data?.map((r) => <ReportCard key={r.id} report={r} />)}
      </ul>
      </section>
    </div>
  )
}

function PendingThreads() {
  const pending = usePendingThreads()
  const moderate = useModeratePendingThread()
  const items = pending.data ?? []

  function reject(postId: string) {
    const reason = window.prompt('Reason for rejecting (optional, shown to the author):') ?? undefined
    moderate.mutate({ postId, action: 'reject', reason })
  }

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
        Pending threads {items.length > 0 && <span className="text-rose">({items.length})</span>}
      </h2>

      {pending.status === 'pending' && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      )}

      {pending.status === 'success' && items.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-ink-muted">
          <div className="text-4xl mb-2">✓</div>
          <p>No threads awaiting approval.</p>
        </div>
      )}

      <ul className="space-y-2">
        {items.map((p) => (
          <ThreadCard key={p.id} post={p} onApprove={() => moderate.mutate({ postId: p.id, action: 'approve' })} onReject={() => reject(p.id)} busy={moderate.isPending} />
        ))}
      </ul>
    </section>
  )
}

function ThreadCard({
  post, onApprove, onReject, busy,
}: { post: GroupPost; onApprove: () => void; onReject: () => void; busy: boolean }) {
  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {post.media_url && (
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 shrink-0">
            {post.media_kind === 'video' ? (
              <video src={post.media_url} className="w-full h-full object-cover" muted />
            ) : (
              <img src={post.media_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-ink-muted">
            in <span className="font-semibold text-ink-2">{post.group_slug}</span> · @{post.author_handle ?? post.author_display_name ?? 'unknown'} · {new Date(post.created_at).toLocaleString()}
          </div>
          {post.body && (
            <p className="mt-1 text-sm text-ink-2 whitespace-pre-wrap break-words line-clamp-4">{post.body}</p>
          )}
          <Link
            to={`/g/${post.group_slug}/p/${post.id}`}
            target="_blank"
            className="inline-block mt-2 text-xs rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
          >
            View thread ↗
          </Link>
        </div>
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={onReject}
          disabled={busy}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold glass text-ink-2 hover:text-danger"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold bg-gradient-brand text-white"
        >
          Approve
        </button>
      </div>
    </li>
  )
}

function ReportCard({ report }: { report: PostReport }) {
  const resolve = useResolveReport()

  async function close(status: 'resolved' | 'dismissed') {
    try {
      await resolve.mutateAsync({ reportId: report.id, nextStatus: status })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-rose/15 text-rose shrink-0">
          {report.reason}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-ink-muted">
            {new Date(report.created_at).toLocaleString()}
          </div>
          {report.note && (
            <p className="mt-1 text-sm text-ink-2 whitespace-pre-wrap break-words">
              {report.note}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Link
              to={`/p/${report.post_id}`}
              target="_blank"
              className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
            >
              View post ↗
            </Link>
            <Link
              to={`/profile/${report.reporter_id}`}
              target="_blank"
              className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
            >
              Reporter ↗
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={() => close('dismissed')}
          disabled={resolve.isPending}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold glass text-ink-2 hover:text-ink"
        >
          Dismiss
        </button>
        <button
          onClick={() => close('resolved')}
          disabled={resolve.isPending}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold bg-gradient-brand text-white"
        >
          Mark resolved
        </button>
      </div>
    </li>
  )
}
