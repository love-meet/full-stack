import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useMyConsents, useExportMyData, downloadJson, POLICY_VERSION,
} from '../../hooks/usePrivacy'

const CONSENT_LABELS: Record<string, string> = {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  guidelines: 'Community guidelines',
  age_18: 'Confirmed you are 18 or over',
}

/**
 * Your data (HS-LM-v1 §07).
 *
 * Two things the stores and the NDPA both require and we did not have: a way
 * to get your data out, and a record of what you agreed to and when.
 *
 * The export downloads immediately rather than being emailed or queued. It is
 * one query and the person is already signed in, so making them wait on a
 * human is ceremony — and a data-export request that quietly never arrives is
 * the specific failure the regulation exists to stop.
 */
export default function PrivacyScreen() {
  const navigate = useNavigate()
  const consents = useMyConsents()
  const exportData = useExportMyData()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function download() {
    setError(null)
    setDone(false)
    try {
      const data = await exportData.mutateAsync()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(data, `love-meet-data-${stamp}.json`)
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const rows = consents.data ?? []

  return (
    <div className="min-h-screen text-ink pb-24">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center font-bold">Your data</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* ── Export ────────────────────────────────────────────────────── */}
        <section className="glass rounded-3xl p-6">
          <h2 className="font-extrabold text-ink">Download everything</h2>
          <p className="mt-2 text-sm text-ink-2 leading-relaxed">
            Your profile, your coin history, the messages you sent, your posts,
            who you said you were interested in, and the gifts you sent and
            received — as a JSON file, straight away.
          </p>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            It does not include who blocked you or what other people said about
            you. That is theirs, not yours.
          </p>

          <button
            onClick={download}
            disabled={exportData.isPending}
            className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-extrabold text-sm glow-rose disabled:opacity-60"
          >
            {exportData.isPending ? 'Gathering…' : 'Download my data'}
          </button>

          {done && (
            <p className="mt-3 text-xs text-success text-center">
              Saved to your downloads.
            </p>
          )}
          {error && <p className="mt-3 text-xs text-danger text-center">{error}</p>}
        </section>

        {/* ── Consents ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
            What you agreed to
          </h2>

          {consents.status === 'pending' && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-14 animate-pulse" />
              ))}
            </div>
          )}

          {consents.status === 'success' && rows.length === 0 && (
            <div className="glass rounded-2xl p-5 text-sm text-ink-muted text-center">
              Nothing recorded yet. Your agreement is captured next time you
              accept the terms.
            </div>
          )}

          <ul className="space-y-1.5">
            {rows.map((c) => (
              <li key={`${c.kind}-${c.version}`} className="glass rounded-2xl px-4 py-3">
                <div className="text-sm font-semibold text-ink">
                  {CONSENT_LABELS[c.kind] ?? c.kind}
                </div>
                <div className="text-[11px] text-ink-muted">
                  Version {c.version} · {new Date(c.accepted_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 px-1 text-[11px] text-ink-muted leading-relaxed">
            Current documents are version {POLICY_VERSION}. Read the{' '}
            <Link to="/legal/terms" className="text-rose font-semibold">terms</Link>,{' '}
            <Link to="/legal/privacy" className="text-rose font-semibold">privacy policy</Link> and{' '}
            <Link to="/legal/guidelines" className="text-rose font-semibold">community guidelines</Link>.
          </p>
        </section>

        {/* ── Deletion ──────────────────────────────────────────────────── */}
        <section className="glass rounded-3xl p-6">
          <h2 className="font-extrabold text-ink">Delete your account</h2>
          <p className="mt-2 text-sm text-ink-2 leading-relaxed">
            Permanent, and done from inside the app — you do not have to email
            anyone to be forgotten.
          </p>
          <button
            onClick={() => navigate('/close-account')}
            className="mt-4 w-full rounded-full py-3 glass text-danger font-bold text-sm"
          >
            Close my account
          </button>
        </section>
      </main>
    </div>
  )
}
