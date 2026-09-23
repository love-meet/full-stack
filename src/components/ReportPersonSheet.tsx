import { useState } from 'react'
import { useSubmitReport, REPORT_REASONS, type ReportReason, type ReportTarget } from '../hooks/useReports'

/**
 * Report a person, a photograph or a message (HS-LM-v1 §07).
 *
 * Deliberately short. Somebody opening this is upset, or frightened, or has
 * just seen something they wish they hadn't — a long form with a required
 * explanation is how a report goes unfiled. One tap on a reason is enough to
 * reach a moderator; the note is optional.
 *
 * It closes on a thank-you rather than dropping the person straight back
 * where they were, because a report that vanishes with no acknowledgement
 * feels like it did not send.
 */
export default function ReportPersonSheet({
  subjectId, subjectLabel, target = 'profile', reference, onClose,
}: {
  subjectId: string
  subjectLabel: string
  target?: ReportTarget
  /** Message id, topic id, or the photo URL — whatever is being reported. */
  reference?: string | null
  onClose: () => void
}) {
  const submit = useSubmitReport()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const what =
    target === 'photo' ? 'this photo'
    : target === 'message' ? 'this message'
    : `@${subjectLabel}`

  async function send() {
    if (!reason || submit.isPending) return
    setError(null)
    try {
      await submit.mutateAsync({ target, subjectId, ref: reference, reason, note })
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-end sm:place-items-center">
      <div
        className="w-full sm:max-w-md bg-surface-2 rounded-t-3xl sm:rounded-3xl p-5"
        style={{ paddingBottom: 'calc(1.25rem + var(--lm-bottom-inset))' }}
      >
        {sent ? (
          <div className="text-center py-4">
            <div className="text-4xl">✓</div>
            <h2 className="mt-3 font-extrabold text-ink">Thank you</h2>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">
              A moderator will look at this. If you want them to stop
              contacting you as well, block them from the ⋯ menu — they are
              not told either way.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white text-sm font-extrabold"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-extrabold text-ink">Report {what}</h2>
            <p className="mt-1 text-xs text-ink-muted">
              They are never told who reported them.
            </p>

            <div className="mt-4 space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={[
                    'w-full text-left rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
                    reason === r.value
                      ? 'bg-rose/15 text-rose ring-1 ring-rose/40'
                      : 'bg-surface/50 text-ink-2 hover:text-ink',
                  ].join(' ')}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Anything else? (optional)"
              className="mt-3 w-full rounded-2xl px-4 py-3 bg-surface/60 text-sm text-ink placeholder:text-ink-muted outline-none resize-none focus:ring-1 focus:ring-rose/60"
            />

            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            <div className="mt-4 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-full py-3 glass text-sm font-semibold text-ink-2"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={!reason || submit.isPending}
                className="flex-1 rounded-full py-3 bg-gradient-brand text-white text-sm font-extrabold disabled:opacity-50"
              >
                {submit.isPending ? 'Sending…' : 'Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
