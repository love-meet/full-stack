import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Gender, StepProps } from '../types'
import { checkUsernameAvailable } from '../../../hooks/useProfile'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Woman' },
  { value: 'male', label: 'Man' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 83 }, (_, i) => currentYear - 18 - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/**
 * Username, gender and date of birth.
 *
 * Gender is here because the feed cannot sort anyone without it (§4). It
 * seeds interested_in to the opposite gender, which is what the feed pairs
 * on — changeable later in Profile. Date of birth is here because 18+.
 * Real name, bio and interests are gone from signup; they live in Profile.
 */
export default function YouStep({ data, set }: StepProps) {
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
      <section className="space-y-1">
        <Label>Username</Label>
        <div className="glass rounded-2xl px-4 py-3 flex items-center gap-1 focus-within:ring-brand transition-shadow">
          <span className="text-ink-muted">@</span>
          <input
            type="text"
            value={data.username}
            onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
            placeholder="janedoe"
            maxLength={20}
            className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-muted text-base"
          />
        </div>
        <UsernameHint status={status} username={data.username} />
      </section>

      <section className="space-y-3">
        <Label>I am</Label>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => {
            const active = data.gender === g.value
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => set({ gender: g.value })}
                className={[
                  'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
                  active
                    ? 'bg-gradient-brand text-white glow-rose'
                    : 'glass text-ink-2 hover:text-ink',
                ].join(' ')}
              >
                {g.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <Label>Date of birth</Label>
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={data.dobDay}
            onChange={(v) => set({ dobDay: v })}
            placeholder="Day"
            options={DAYS.map((d) => ({ value: String(d), label: String(d) }))}
          />
          <Select
            value={data.dobMonth}
            onChange={(v) => set({ dobMonth: v })}
            placeholder="Month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <Select
            value={data.dobYear}
            onChange={(v) => set({ dobYear: v })}
            placeholder="Year"
            options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <p className="text-xs text-ink-muted px-1">
          You must be 18 or older to use Love meet. Only your age is ever shown to other people.
        </p>
      </section>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-ink-muted px-1">{children}</h3>
  )
}

function Select({
  value, onChange, placeholder, options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className="glass rounded-2xl px-3 py-3 focus-within:ring-brand transition-shadow">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-ink text-base appearance-none cursor-pointer"
        style={{ colorScheme: 'dark' }}
      >
        <option value="" disabled className="bg-surface-2 text-ink-muted">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-2 text-ink">{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function UsernameHint({ status, username }: { status: UsernameStatus; username: string }) {
  if (!username) {
    return (
      <p className="text-xs text-ink-muted px-1">
        Lowercase letters, numbers, and underscores. Min 3 chars.
      </p>
    )
  }
  const map: Record<UsernameStatus, { text: string; color: string }> = {
    idle:      { text: '',                              color: 'text-ink-muted' },
    checking:  { text: 'Checking…',                     color: 'text-ink-muted' },
    available: { text: '✓ Available',                   color: 'text-success' },
    taken:     { text: '× Already taken',               color: 'text-danger' },
    invalid:   { text: '× Min 3 chars, a-z 0-9 _ only', color: 'text-danger' },
    error:     { text: "× Couldn't check, try again",   color: 'text-danger' },
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
