import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { useProfile } from '../../hooks/useProfile'
import { useWallet } from '../../hooks/useWallet'
import { useEarningsSummary } from '../../hooks/useWallet'
import { useIsAdmin } from '../../hooks/useAdmin'
import WalletCardDeck from '../../components/wallet/WalletCardDeck'
import ConfirmDialog from '../../components/ConfirmDialog'

type Item = {
  icon: string
  label: string
  hint?: string
  destructive?: boolean
  disabled?: boolean
  soon?: string
  onClick?: () => void
}

/**
 * Full-page replacement for the old bottom-sheet settings menu.
 * Top: a swipeable 3D Wallet/Earnings card deck (no avatar).
 * Below: the reorganized menu.
 */
export default function ProfileMenuScreen() {
  const navigate = useNavigate()
  const signOut = useAuth((s) => s.signOut)
  const profileQ = useProfile()
  const wallet = useWallet()
  const earnings = useEarningsSummary()
  const isAdmin = useIsAdmin()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [busy, setBusy] = useState(false)

  if (profileQ.isLoading || !profileQ.data) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }

  const profile = profileQ.data
  const refCode = `LM-${profile.id.slice(0, 6).toUpperCase()}`

  async function doLogout() {
    setBusy(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Account',
      items: [
        { icon: '✎', label: 'Edit profile', hint: 'Photo, handle, bio, interests', onClick: () => navigate('/profile/edit') },
        { icon: '🛡', label: 'Security', hint: 'PIN, password', onClick: () => navigate('/security') },
      ],
    },
    {
      title: 'Money',
      items: [
        { icon: '⬇', label: 'Add funds', hint: 'Card, transfer, USSD via ALATPay', onClick: () => navigate('/wallet/deposit') },
        { icon: '🧾', label: 'Transaction history', hint: 'Every credit & debit', onClick: () => navigate('/wallet') },
        { icon: '💰', label: 'Earnings history', hint: 'Tips, gifts, referrals received', onClick: () => navigate('/earnings') },
        { icon: '⭐', label: 'Subscription', hint: 'Premium plans', onClick: () => navigate('/subscription') },
        { icon: '💸', label: 'Affiliate', hint: 'Earn 5% for life on referrals', onClick: () => navigate('/affiliate') },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: '👥', label: 'Create a group', hint: 'Start your own community', onClick: () => navigate('/groups/new') },
        { icon: '🔖', label: 'Saved posts', hint: 'Your bookmarks', onClick: () => navigate('/saved') },
        { icon: '🎉', label: 'Invite friends', hint: 'Share your referral code', onClick: () => navigate('/invite') },
        { icon: '🚫', label: 'Blocked users', hint: 'Manage who you blocked', onClick: () => navigate('/blocked') },
        { icon: '🔕', label: 'Muted users', hint: 'Manage who you muted', onClick: () => navigate('/muted') },
      ],
    },
    ...(isAdmin ? [{
      title: 'Admin',
      items: [
        { icon: '🛠', label: 'Admin console', hint: 'Moderation, users, payouts', onClick: () => navigate('/admin') },
      ] as Item[],
    }] : []),
    {
      title: 'Support',
      items: [
        { icon: '💬', label: 'Live support', hint: 'Chat with our team — open a ticket', onClick: () => navigate('/support') },
        { icon: '❓', label: 'Help & support', onClick: () => navigate('/legal/help') },
        { icon: '🔒', label: 'Privacy policy', onClick: () => navigate('/legal/privacy') },
        { icon: '📜', label: 'Terms of service', onClick: () => navigate('/legal/terms') },
        { icon: 'ℹ', label: 'About Love meet', onClick: () => navigate('/legal/about') },
      ],
    },
    {
      title: 'Danger zone',
      items: [
        { icon: '🗑', label: 'Close account', hint: 'Permanent', destructive: true, onClick: () => navigate('/close-account') },
        { icon: '⎋', label: 'Log out', destructive: true, onClick: () => setConfirmLogout(true) },
      ],
    },
  ]

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">Menu</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        {/* 3D card deck */}
        <WalletCardDeck
          uuid={profile.id}
          referralCode={refCode}
          balanceUsdt={wallet.data?.balance_usdt ?? 0}
          earningsUsdt={earnings.data?.lifetime_earnings ?? 0}
        />

        {/* Menu */}
        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="px-1 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-1.5">
                {section.title}
              </h2>
              <ul className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
                {section.items.map((it) => (
                  <li key={it.label}>
                    <button
                      onClick={it.disabled ? undefined : it.onClick}
                      disabled={busy || it.disabled}
                      className={[
                        'w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors',
                        it.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04]',
                        it.destructive ? 'text-danger' : 'text-ink',
                      ].join(' ')}
                    >
                      <span className="text-xl w-6 text-center shrink-0">{it.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{it.label}</span>
                        {it.hint && (
                          <span className="block text-[11px] text-ink-muted font-medium truncate">
                            {it.hint}
                          </span>
                        )}
                      </span>
                      {it.soon ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-gold shrink-0">
                          {it.soon}
                        </span>
                      ) : !it.disabled ? (
                        <span className="text-ink-muted text-base shrink-0">›</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        message="You'll need to sign in again to use the app."
        confirmLabel="Log out"
        destructive
        busy={busy}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); void doLogout() }}
      />
    </div>
  )
}
