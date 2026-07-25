import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Gender, StepProps } from '../types'

function getGenders(t: TFunction): { value: Gender; label: string }[] {
  return [
    { value: 'female', label: t('onboarding.stepFields.details.genderWoman') },
    { value: 'male', label: t('onboarding.stepFields.details.genderMan') },
    { value: 'nonbinary', label: t('onboarding.stepFields.details.genderNonbinary') },
    { value: 'other', label: t('onboarding.stepFields.details.genderOther') },
    { value: 'prefer_not_to_say', label: t('onboarding.stepFields.details.genderPreferNot') },
  ]
}

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 83 }, (_, i) => currentYear - 18 - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export default function DetailsStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  const GENDERS = getGenders(t)
  const MONTHS = t('onboarding.stepFields.details.months', { returnObjects: true }) as string[]
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Label>{t('onboarding.stepFields.details.iAm')}</Label>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => {
            const active = data.gender === g.value
            return (
              <button
                key={g.value}
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
        <Label>{t('onboarding.stepFields.details.dob')}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={data.dobDay}
            onChange={(v) => set({ dobDay: v })}
            placeholder={t('onboarding.stepFields.details.day')}
            options={DAYS.map((d) => ({ value: String(d), label: String(d) }))}
          />
          <Select
            value={data.dobMonth}
            onChange={(v) => set({ dobMonth: v })}
            placeholder={t('onboarding.stepFields.details.month')}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <Select
            value={data.dobYear}
            onChange={(v) => set({ dobYear: v })}
            placeholder={t('onboarding.stepFields.details.year')}
            options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <p className="text-xs text-ink-muted px-1">
          {t('onboarding.stepFields.details.ageGateNote')}
        </p>
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

type SelectProps = {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}

function Select({ value, onChange, placeholder, options }: SelectProps) {
  return (
    <div className="glass rounded-2xl px-3 py-3 focus-within:ring-brand transition-shadow">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-ink text-base appearance-none cursor-pointer"
        style={{ colorScheme: 'dark' }}
      >
        <option value="" disabled className="bg-surface-2 text-ink-muted">
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-2 text-ink">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
