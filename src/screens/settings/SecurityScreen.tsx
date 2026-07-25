import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHasPin, useSetPin, useUpdatePassword } from '../../hooks/useSecurity'
import { useProfile, useUpdateProfile } from '../../hooks/useProfile'

export default function SecurityScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const hasPin = useHasPin()

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
          <div className="flex-1 text-center text-ink font-bold">{t('menu.security')}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-8">
        <PinSection alreadySet={hasPin.data === true} />
        <PasswordSection />
        <NotificationsSection />
      </main>
    </div>
  )
}

function PinSection({ alreadySet }: { alreadySet: boolean }) {
  const { t } = useTranslation()
  const setPin = useSetPin()
  const [pin, setPin1] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  async function save() {
    setError(null)
    if (!/^\d{4,6}$/.test(pin)) {
      setError(t('security.pinMustBe4to6'))
      return
    }
    if (pin !== confirm) {
      setError(t('security.pinsDontMatch'))
      return
    }
    try {
      await setPin.mutateAsync(pin)
      setPin1('')
      setConfirm('')
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
        {t('security.pinTitle')}
      </h2>
      <div className="glass rounded-2xl p-5">
        <p className="text-sm text-ink-2">
          {alreadySet
            ? t('security.pinAlreadySet')
            : t('security.pinAddNew')}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-xs font-bold text-ink-2 mb-1.5">{t('security.newPin')}</div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))}
              className="lm-input tracking-[0.4em] text-center font-extrabold"
              placeholder="••••"
            />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-ink-2 mb-1.5">{t('security.confirmPin')}</div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              className="lm-input tracking-[0.4em] text-center font-extrabold"
              placeholder="••••"
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <button
          onClick={save}
          disabled={setPin.isPending || !pin || !confirm}
          className={[
            'mt-4 w-full rounded-full py-3 text-sm font-bold transition-opacity',
            setPin.isPending || !pin || !confirm
              ? 'bg-surface-3 text-ink-muted'
              : 'bg-gradient-brand text-white glow-rose',
          ].join(' ')}
        >
          {setPin.isPending
            ? t('editProfile.saving')
            : savedFlash
              ? t('editProfile.saved')
              : alreadySet ? t('security.replacePin') : t('security.setPin')}
        </button>
      </div>
    </section>
  )
}

function PasswordSection() {
  const { t } = useTranslation()
  const update = useUpdatePassword()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  async function save() {
    setError(null)
    if (pw.length < 8) { setError(t('security.passwordMinLength')); return }
    if (pw !== confirm) { setError(t('security.passwordsDontMatch')); return }
    try {
      await update.mutateAsync(pw)
      setPw('')
      setConfirm('')
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
        {t('security.passwordTitle')}
      </h2>
      <div className="glass rounded-2xl p-5">
        <p className="text-sm text-ink-2">
          {t('security.passwordDesc')}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-xs font-bold text-ink-2 mb-1.5">{t('security.newPassword')}</div>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="lm-input"
            />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-ink-2 mb-1.5">{t('security.confirmPassword')}</div>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="lm-input"
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <button
          onClick={save}
          disabled={update.isPending || !pw || !confirm}
          className={[
            'mt-4 w-full rounded-full py-3 text-sm font-bold transition-opacity',
            update.isPending || !pw || !confirm
              ? 'bg-surface-3 text-ink-muted'
              : 'bg-gradient-brand text-white glow-rose',
          ].join(' ')}
        >
          {update.isPending ? t('editProfile.saving') : savedFlash ? t('editProfile.saved') : t('security.updatePassword')}
        </button>
      </div>
    </section>
  )
}

function NotificationsSection() {
  const { t } = useTranslation()
  const profile = useProfile()
  const update = useUpdateProfile()
  const emailOn = profile.data?.email_notifications ?? true
  const tgOn = profile.data?.telegram_notifications ?? false
  const hasTelegram = profile.data?.telegram_user_id != null
  const busy = profile.isLoading || update.isPending

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
        {t('notif.title')}
      </h2>
      <p className="text-[11px] text-ink-muted px-1 pb-2">
        {t('security.notificationsDesc')}
      </p>
      <div className="glass rounded-2xl divide-y divide-white/5">
        <ToggleRow
          title={t('security.emailNotifications')}
          subtitle={t('security.emailNotificationsDesc')}
          on={emailOn}
          disabled={busy}
          onToggle={() => update.mutate({ email_notifications: !emailOn })}
        />
        <ToggleRow
          title={t('security.telegramNotifications')}
          subtitle={hasTelegram
            ? t('security.telegramNotificationsOn')
            : t('security.telegramNotificationsOff')}
          on={tgOn}
          disabled={busy || !hasTelegram}
          onToggle={() => update.mutate({ telegram_notifications: !tgOn })}
        />
      </div>
    </section>
  )
}

function ToggleRow({
  title, subtitle, on, disabled, onToggle,
}: {
  title: string; subtitle: string; on: boolean; disabled: boolean; onToggle: () => void
}) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">{subtitle}</div>
      </div>
      <button
        onClick={() => { if (!disabled) onToggle() }}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        className={[
          'shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-40',
          on ? 'bg-rose' : 'bg-surface-3',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
            on ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
