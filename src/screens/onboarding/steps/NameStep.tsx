import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { StepProps } from '../types'
import { checkUsernameAvailable } from '../../../hooks/useProfile'
import { useUploadAvatar } from '../../../hooks/useUploadAvatar'
import { defaultAvatar } from '../../../lib/avatar'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'

export default function NameStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UsernameStatus>('idle')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const u = data.username.trim()
    if (!u) {
      setStatus('idle')
      set({ usernameAvailable: null })
      return
    }
    if (u.length < 3 || !/^[a-z0-9_]+$/.test(u)) {
      setStatus('invalid')
      set({ usernameAvailable: false })
      return
    }
    setStatus('checking')
    set({ usernameAvailable: null })
    timer.current = window.setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(u)
        setStatus(ok ? 'available' : 'taken')
        set({ usernameAvailable: ok })
      } catch {
        setStatus('error')
        set({ usernameAvailable: false })
      }
    }, 400)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.username])

  return (
    <div className="space-y-6">
      <AvatarPicker
        value={data.avatar}
        onChange={(url) => set({ avatar: url })}
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label={t('onboarding.stepFields.name.firstName')}
          value={data.firstName}
          onChange={(v) => set({ firstName: v })}
          placeholder={t('onboarding.stepFields.name.firstNamePlaceholder')}
        />
        <Field
          label={t('onboarding.stepFields.name.lastName')}
          value={data.lastName}
          onChange={(v) => set({ lastName: v })}
          placeholder={t('onboarding.stepFields.name.lastNamePlaceholder')}
        />
      </div>
      <div className="space-y-1">
        <Field
          label={t('onboarding.stepFields.name.username')}
          prefix="@"
          value={data.username}
          onChange={(v) => set({ username: v.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
          placeholder={t('onboarding.stepFields.name.usernamePlaceholder')}
          maxLength={20}
        />
        <UsernameHint status={status} username={data.username} />
      </div>
    </div>
  )
}

function AvatarPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const upload = useUploadAvatar()
  const [error, setError] = useState<string | null>(null)

  // What to show when nothing is set yet.
  const displayed = value || defaultAvatar(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    try {
      const url = await upload.mutateAsync(f)
      onChange(url)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      // Allow re-picking the same file later.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className="relative group rounded-full"
        aria-label={t('onboarding.stepFields.name.changePhotoAria')}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-brand blur-md opacity-70" aria-hidden />
        <img
          src={displayed}
          alt=""
          className="relative w-28 h-28 rounded-full object-cover ring-4 ring-surface"
        />
        <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-gradient-brand text-white grid place-items-center text-base font-bold glow-rose">
          📷
        </span>
        {upload.isPending && (
          <span className="absolute inset-0 rounded-full grid place-items-center bg-black/40 text-white text-xs font-bold">
            …
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className="text-sm font-semibold text-ink-2 hover:text-rose transition-colors disabled:opacity-60"
      >
        {value ? t('onboarding.stepFields.name.changePhoto') : t('onboarding.stepFields.name.addPhoto')}
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
    </div>
  )
}

function UsernameHint({ status, username }: { status: UsernameStatus; username: string }) {
  const { t } = useTranslation()
  if (!username) {
    return (
      <p className="text-xs text-ink-muted px-1">
        {t('onboarding.stepFields.name.usernameHintDefault')}
      </p>
    )
  }
  const map: Record<UsernameStatus, { text: string; color: string }> = {
    idle:      { text: '',                                            color: 'text-ink-muted' },
    checking:  { text: t('onboarding.stepFields.name.usernameChecking'),  color: 'text-ink-muted' },
    available: { text: t('onboarding.stepFields.name.usernameAvailable'), color: 'text-success' },
    taken:     { text: t('onboarding.stepFields.name.usernameTaken'),     color: 'text-danger' },
    invalid:   { text: t('onboarding.stepFields.name.usernameInvalid'),   color: 'text-danger' },
    error:     { text: t('onboarding.stepFields.name.usernameError'),     color: 'text-danger' },
  }
  const { text, color } = map[status]
  if (!text) return null
  return (
    <motion.p
      key={text}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-xs font-semibold px-1 ${color}`}
    >
      {text}
    </motion.p>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  prefix?: string
  maxLength?: number
}

function Field({ label, value, onChange, placeholder, prefix, maxLength }: FieldProps) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted pl-1">
        {label}
      </span>
      <div className="mt-1 glass rounded-2xl px-4 py-3 flex items-center gap-1 focus-within:ring-brand transition-shadow">
        {prefix && <span className="text-ink-muted">{prefix}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-muted text-base"
        />
      </div>
    </label>
  )
}
