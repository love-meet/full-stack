import { Link } from 'react-router-dom'
import { useOpenReports, useResolveReport, type PostReport } from '../../hooks/useAdmin'

export default function ModerationQueue() {
  const reports = useOpenReports()

  return (
    <div>
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
    </div>
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
