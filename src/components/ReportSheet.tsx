import { useState } from 'react'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useReportPost, type ReportReason } from '../hooks/usePostActions'

const REASONS: { id: ReportReason; label: string; sub: string }[] = [
  { id: 'spam',          label: 'Spam or scam',           sub: 'Unwanted commercial or repetitive content.' },
  { id: 'inappropriate', label: 'Inappropriate content',  sub: 'Nudity, sexual or graphic content outside Naughty.' },
  { id: 'harassment',    label: 'Harassment or bullying', sub: 'Targeted abuse or hate speech.' },
  { id: 'underage',      label: 'Underage user',          sub: 'You believe this user is under 18.' },
  { id: 'illegal',       label: 'Illegal',                sub: 'Something that breaks the law.' },
  { id: 'other',         label: 'Something else',         sub: 'Tell us what.' },
]

type Props = {
  postId: string
  onClose: () => void
}

export default function ReportSheet({ postId, onClose }: Props) {
  useDrawerLock()
  const report = useReportPost()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<'pick' | 'sent'>('pick')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason) return
    setError(null)
    try {
      await report.mutateAsync({ postId, reason, note: note || null })
      setPhase('sent')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer.Root
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      snapPoints={[0.7, 0.95]}
      modal
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-w-md bg-surface-2 rounded-t-3xl flex flex-col outline-none"
          style={{ height: '95dvh' }}
        >
          <div className="pt-3 pb-1 shrink-0">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>

          {phase === 'pick' ? (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-1">
                <Drawer.Title className="text-lg font-extrabold text-ink">Report post</Drawer.Title>
                <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl px-2">×</button>
              </div>
              <p className="text-xs text-ink-muted mb-4">
                Anonymous to the poster. Reports land with our moderators.
              </p>

              <ul className="space-y-2">
                {REASONS.map((r) => {
                  const active = reason === r.id
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setReason(r.id)}
                        className={[
                          'w-full text-left rounded-2xl px-4 py-3 border transition-colors',
                          active
                            ? 'border-rose bg-rose/10'
                            : 'border-white/8 bg-surface/50 hover:border-white/20',
                        ].join(' ')}
                      >
                        <div className="text-sm font-semibold text-ink">{r.label}</div>
                        <div className="text-xs text-ink-muted mt-0.5">{r.sub}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {reason === 'other' && (
                <div className="mt-3 glass rounded-2xl p-3 focus-within:ring-brand transition-shadow">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="What happened?"
                    className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-sm resize-none"
                  />
                  <div className="text-right text-[11px] text-ink-muted">{note.length}/500</div>
                </div>
              )}

              {error && <p className="mt-3 text-sm text-danger">{error}</p>}

              <button
                onClick={submit}
                disabled={!reason || report.isPending}
                className={[
                  'mt-4 w-full rounded-full py-3.5 font-semibold transition-opacity',
                  reason && !report.isPending
                    ? 'bg-gradient-brand text-white glow-rose'
                    : 'bg-surface-3 text-ink-muted',
                ].join(' ')}
                style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
              >
                {report.isPending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          ) : (
            <div className="flex-1 p-8 text-center">
              <Drawer.Title className="sr-only">Report submitted</Drawer.Title>
              <div className="text-5xl">✓</div>
              <h2 className="mt-3 text-xl font-extrabold text-ink">Thanks for telling us</h2>
              <p className="mt-2 text-sm text-ink-muted">
                We'll review it. You won't hear back unless we have a question.
              </p>
              <button
                onClick={onClose}
                className="mt-6 inline-flex rounded-full px-7 py-3 bg-gradient-brand text-white text-sm font-semibold glow-rose"
              >
                Done
              </button>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
