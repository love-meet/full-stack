import { useTranslation } from 'react-i18next'
import type { StepProps } from '../types'

export default function PreferencesStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  // Deliberately NOT clamped as you type. Clamping every keystroke made the
  // field impossible to edit: with 18 in it, deleting the "8" left "1",
  // which clamped straight back to 18 — so you could never clear it to type
  // 35. Out-of-range values are allowed to sit in the field and are caught
  // by the step's 18–100 check (see stepStatus in OnboardingScreen), which
  // keeps Continue disabled and explains why.
  //
  // The opposite bound is only pulled along once this one is a real in-range
  // value, otherwise a half-typed or cleared field would drag it too (e.g.
  // clearing "max" would have reset "min" to 0 via Math.min).
  function setMin(n: number) {
    if (inRange(n)) set({ ageMin: n, ageMax: Math.max(n, data.ageMax) })
    else set({ ageMin: n })
  }
  function setMax(n: number) {
    if (inRange(n)) set({ ageMax: n, ageMin: Math.min(n, data.ageMin) })
    else set({ ageMax: n })
  }

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <Label>{t('onboarding.stepFields.preferences.ageRangeLabel')}</Label>
          <span className="text-sm font-semibold text-ink">
            {data.ageMin || '—'} – {data.ageMax || '—'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t('onboarding.stepFields.preferences.min')} value={data.ageMin} onChange={setMin} />
          <NumberField label={t('onboarding.stepFields.preferences.max')} value={data.ageMax} onChange={setMax} />
        </div>
      </section>

      <section className="space-y-3">
        <Label>{t('onboarding.stepFields.preferences.privacyLabel')}</Label>
        <ToggleRow
          title={t('onboarding.stepFields.preferences.showOnlineTitle')}
          subtitle={t('onboarding.stepFields.preferences.showOnlineSub')}
          value={data.showOnlineStatus}
          onChange={(v) => set({ showOnlineStatus: v })}
        />
        <ToggleRow
          title={t('onboarding.stepFields.preferences.showDistanceTitle')}
          subtitle={t('onboarding.stepFields.preferences.showDistanceSub')}
          value={data.showDistance}
          onChange={(v) => set({ showDistance: v })}
        />
      </section>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-ink-muted px-1">
      {children}
    </h3>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted pl-1">
        {label}
      </span>
      <div className="mt-1 glass rounded-2xl px-4 py-3 focus-within:ring-brand transition-shadow">
        <input
          type="number"
          inputMode="numeric"
          min={18}
          max={100}
          // 0 renders as blank so the field can genuinely be emptied; any
          // digits the user types are kept verbatim (validation gates
          // Continue rather than rewriting the input under them).
          value={value === 0 ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 3)
            onChange(raw === '' ? 0 : Number(raw))
          }}
          className="w-full bg-transparent outline-none text-ink text-base"
        />
      </div>
    </label>
  )
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full glass rounded-2xl px-4 py-3.5 flex items-center justify-between text-left hover:text-ink transition-colors"
    >
      <div className="min-w-0">
        <div className="text-ink font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-ink-muted mt-0.5">{subtitle}</div>}
      </div>
      <span
        className={[
          'relative h-7 w-12 rounded-full transition-colors shrink-0',
          value ? 'bg-gradient-brand glow-rose' : 'bg-surface-3',
        ].join(' ')}
        aria-hidden
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

function inRange(n: number) {
  return n >= 18 && n <= 100
}
