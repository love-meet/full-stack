import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { LookingFor, StepProps } from '../types'

function getLookingFor(t: TFunction): { value: LookingFor; label: string; sub: string }[] {
  return [
    { value: 'serious', label: t('onboarding.stepFields.about.seriousLabel'), sub: t('onboarding.stepFields.about.seriousSub') },
    { value: 'casual',  label: t('onboarding.stepFields.about.casualLabel'),  sub: t('onboarding.stepFields.about.casualSub') },
    { value: 'friends', label: t('onboarding.stepFields.about.friendsLabel'), sub: t('onboarding.stepFields.about.friendsSub') },
  ]
}

// Hobby values are persisted verbatim to the profile, so they stay in
// English regardless of app language (same reasoning as the interview
// questionnaire's multiple-choice options).
const HOBBIES = [
  'Travel', 'Music', 'Movies', 'Love making', 'Reading', 'Cooking', 'Dancing', 'Painting',
  'Photography', 'Basketball', 'Gaming', 'Volleyball', 'Fitness', 'Yoga', 'Hiking', 'Swimming',
  'Running', 'Cycling', 'Food & Dining', 'Wine', 'Coffee', 'Writing', 'Clubbing', 'Comedy',
  'Night Life', 'IT', 'Programming', 'Fashion', 'Shopping', 'Football', 'Snooker', 'Tennis',
]

const HOBBY_MIN = 3
const HOBBY_MAX = 5

export default function AboutStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  const LOOKING_FOR = getLookingFor(t)
  function toggleHobby(name: string) {
    const has = data.hobbies.includes(name)
    if (has) {
      set({ hobbies: data.hobbies.filter((h) => h !== name) })
    } else if (data.hobbies.length < HOBBY_MAX) {
      set({ hobbies: [...data.hobbies, name] })
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Label>{t('onboarding.stepFields.about.bioLabel')}</Label>
        <div className="glass rounded-2xl p-4 focus-within:ring-brand transition-shadow">
          <textarea
            value={data.bio}
            onChange={(e) => set({ bio: e.target.value })}
            rows={3}
            maxLength={300}
            placeholder={t('onboarding.stepFields.about.bioPlaceholder')}
            className="w-full bg-transparent outline-none text-ink placeholder:text-ink-muted text-base resize-none"
          />
          <div className="flex justify-end text-[11px] text-ink-muted">
            {data.bio.length}/300
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <Label>{t('onboarding.stepFields.about.lookingForLabel')}</Label>
        <div className="grid sm:grid-cols-3 gap-2">
          {LOOKING_FOR.map((opt) => {
            const active = data.lookingFor === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => set({ lookingFor: opt.value })}
                className={[
                  'relative rounded-2xl p-4 text-left transition-colors',
                  active
                    ? 'bg-gradient-brand text-white glow-rose'
                    : 'glass text-ink-2 hover:text-ink',
                ].join(' ')}
              >
                <div className="font-bold">{opt.label}</div>
                <div className={`text-xs mt-0.5 ${active ? 'text-white/85' : 'text-ink-muted'}`}>
                  {opt.sub}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <Label>{t('onboarding.stepFields.about.hobbiesLabel')}</Label>
          <span
            className={`text-[11px] font-semibold ${
              data.hobbies.length >= HOBBY_MIN ? 'text-success' : 'text-ink-muted'
            }`}
          >
            {t('onboarding.stepFields.about.hobbiesCount', { count: data.hobbies.length, max: HOBBY_MAX, min: HOBBY_MIN })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {HOBBIES.map((name) => {
            const active = data.hobbies.includes(name)
            const disabled = !active && data.hobbies.length >= HOBBY_MAX
            return (
              <button
                key={name}
                onClick={() => toggleHobby(name)}
                disabled={disabled}
                className={[
                  'px-3.5 py-1.5 rounded-full text-sm transition-colors',
                  active
                    ? 'bg-gradient-warm text-surface font-semibold glow-magenta'
                    : disabled
                      ? 'glass text-ink-muted opacity-50 cursor-not-allowed'
                      : 'glass text-ink-2 hover:text-ink',
                ].join(' ')}
              >
                {name}
              </button>
            )
          })}
        </div>
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
