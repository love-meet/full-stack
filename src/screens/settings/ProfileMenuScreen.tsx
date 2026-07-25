import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../stores/auth'
import { SUPPORTED_LANGUAGES } from '../../i18n/languages'
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
  const { t, i18n } = useTranslation()
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
      title: t('menu.account'),
      items: [
        { icon: '✎', label: t('menu.editProfile'), hint: t('menu.editProfileHint'), onClick: () => navigate('/profile/edit') },
        { icon: '🛡', label: t('menu.security'), hint: t('menu.securityHint'), onClick: () => navigate('/security') },
        {
          icon: '🌐',
          label: t('settings.language'),
          hint: SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.nativeName,
          onClick: () => navigate('/language'),
        },
      ],
    },
    {
      title: t('menu.money'),
      items: [
        { icon: '⬇', label: t('menu.addFunds'), hint: t('menu.addFundsHint'), onClick: () => navigate('/wallet/deposit') },
        { icon: '🧾', label: t('menu.transactionHistory'), hint: t('menu.transactionHistoryHint'), onClick: () => navigate('/wallet') },
        { icon: '💰', label: t('menu.earningsHistory'), hint: t('menu.earningsHistoryHint'), onClick: () => navigate('/earnings') },
        { icon: '⭐', label: t('menu.subscription'), hint: t('menu.subscriptionHint'), onClick: () => navigate('/subscription') },
        { icon: '💸', label: t('menu.affiliate'), hint: t('menu.affiliateHint'), onClick: () => navigate('/affiliate') },
      ],
    },
    {
      title: t('menu.activity'),
      items: [
        { icon: '👥', label: t('menu.createGroup'), hint: t('menu.createGroupHint'), onClick: () => navigate('/groups/new') },
        { icon: '🔖', label: t('menu.savedPosts'), hint: t('menu.savedPostsHint'), onClick: () => navigate('/saved') },
        { icon: '🎉', label: t('menu.inviteFriends'), hint: t('menu.inviteFriendsHint'), onClick: () => navigate('/invite') },
        { icon: '🚫', label: t('menu.blockedUsers'), hint: t('menu.blockedUsersHint'), onClick: () => navigate('/blocked') },
        { icon: '🔕', label: t('menu.mutedUsers'), hint: t('menu.mutedUsersHint'), onClick: () => navigate('/muted') },
      ],
    },
    ...(isAdmin ? [{
      title: t('menu.admin'),
      items: [
        { icon: '🛠', label: t('menu.adminConsole'), hint: t('menu.adminConsoleHint'), onClick: () => navigate('/admin') },
      ] as Item[],
    }] : []),
    {
      title: t('menu.support'),
      items: [
        { icon: '💬', label: t('menu.liveSupport'), hint: t('menu.liveSupportHint'), onClick: () => navigate('/support') },
        { icon: '❓', label: t('menu.helpSupport'), onClick: () => navigate('/legal/help') },
        { icon: '🔒', label: t('menu.privacyPolicy'), onClick: () => navigate('/legal/privacy') },
        { icon: '📜', label: t('menu.termsOfService'), onClick: () => navigate('/legal/terms') },
        { icon: 'ℹ', label: t('menu.aboutLoveMeet'), onClick: () => navigate('/legal/about') },
      ],
    },
    {
      title: t('menu.dangerZone'),
      items: [
        { icon: '🗑', label: t('menu.closeAccount'), hint: t('menu.closeAccountHint'), destructive: true, onClick: () => navigate('/close-account') },
        { icon: '⎋', label: t('menu.logOut'), destructive: true, onClick: () => setConfirmLogout(true) },
      ],
    },
  ]

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('post.back')}
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">{t('profile.menu')}</div>
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
        title={t('menu.logoutConfirmTitle')}
        message={t('menu.logoutConfirmMessage')}
        confirmLabel={t('menu.logOut')}
        destructive
        busy={busy}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); void doLogout() }}
      />
    </div>
  )
}
