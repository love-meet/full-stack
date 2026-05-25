import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../../hooks/useProfile'
import { useAffiliateSummary } from '../../hooks/useAffiliate'
import { useUserCurrency } from '../../hooks/useFx'
import { getSurface } from '../../lib/surface'

/**
 * Affiliate program: refer people and earn 5% of everything they ever spend
 * on subscriptions, for life. Shows the user's code/link, lifetime affiliate
 * earnings and referral count.
 */
export default function AffiliateScreen() {
  const navigate = useNavigate()
  const profile = useProfile()
  const summary = useAffiliateSummary()
  const cur = useUserCurrency()
  const [flash, setFlash] = useState<string | null>(null)

  const id = profile.data?.id ?? ''
  const refCode = id ? `LM-${id.slice(0, 6).toUpperCase()}` : '…'
  const inviteUrl = `${window.location.origin}/?ref=${refCode}`
  const shareText = `Join me on Love meet 💕 Use my code ${refCode}: ${inviteUrl}`

  function ping(msg: string) {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 1800)
  }
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); ping(`${label} copied`) }
    catch { ping('Could not copy') }
  }
  function share() {
    if (getSurface() === 'telegram' && window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp as unknown as { openTelegramLink?: (s: string) => void }
      const tg = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`
      if (wa.openTelegramLink) { wa.openTelegramLink(tg); return }
    }
    if (navigator.share) { void navigator.share({ title: 'Love meet', text: shareText, url: inviteUrl }).catch(() => {}); return }
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')
  }

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Affiliate</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* Hero / pitch */}
        <div className="relative overflow-hidden rounded-3xl p-6 text-white text-center"
             style={{ background: 'linear-gradient(135deg, var(--color-magenta) 0%, var(--color-rose) 55%, var(--color-coral) 100%)' }}>
          <div className="text-4xl mb-2">💸</div>
          <h1 className="text-xl font-extrabold">Earn 5% — for life</h1>
          <p className="text-sm text-white/90 mt-1">
            Refer anyone to Love meet. Every time they pay for a subscription,
            you earn <span className="font-bold">5%</span> — forever. It's a real income stream.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass rounded-2xl p-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">Referrals</div>
            <div className="mt-1 text-3xl font-extrabold text-ink">
              {summary.isPending ? '—' : summary.data?.referral_count ?? 0}
            </div>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">Affiliate earned</div>
            <div className="mt-1 text-2xl font-extrabold text-gradient-warm">
              {summary.isPending || cur.pending ? '—' : cur.format(summary.data?.affiliate_earnings ?? 0)}
            </div>
          </div>
        </div>

        {/* Code + link */}
        <div className="glass rounded-3xl p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">Your referral code</div>
          <button onClick={() => copy(refCode, 'Code')} className="mt-1 w-full flex items-center justify-between gap-2 group">
            <span className="text-2xl font-extrabold text-gradient-warm tracking-wide">{refCode}</span>
            <span className="text-ink-muted group-hover:text-ink text-lg">⧉</span>
          </button>
          <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">Invite link</div>
          <button onClick={() => copy(inviteUrl, 'Link')} className="mt-1 w-full flex items-center justify-between gap-2 group">
            <span className="text-sm font-mono text-ink-2 truncate">{inviteUrl}</span>
            <span className="text-ink-muted group-hover:text-ink text-lg shrink-0">⧉</span>
          </button>
        </div>

        <button onClick={share} className="w-full rounded-full py-3.5 bg-gradient-brand text-white font-bold glow-rose">
          ↗ Share &amp; start earning
        </button>

        <p className="text-[11px] text-ink-muted text-center">
          Earnings land in your wallet as referral bonuses and can be withdrawn like any other earnings.
        </p>

        {flash && <p className="text-center text-xs text-success font-semibold">{flash}</p>}
      </main>
    </div>
  )
}
