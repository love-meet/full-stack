import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Intent, StepProps } from '../types'

function getOptions(t: TFunction): { value: Intent; emoji: string; label: string; sub: string }[] {
  return [
    {
      value: 'relationship',
      emoji: '💞',
      label: t('onboarding.stepFields.path.relationshipLabel'),
      sub: t('onboarding.stepFields.path.relationshipSub'),
    },
    {
      value: 'fun',
      emoji: '🎉',
      label: t('onboarding.stepFields.path.funLabel'),
      sub: t('onboarding.stepFields.path.funSub'),
    },
  ]
}

export default function PathStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  const OPTIONS = getOptions(t)
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {OPTIONS.map((opt) => {
        const active = data.intent === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => set({ intent: opt.value })}
            className={[
              'relative rounded-2xl p-5 text-left transition-colors',
              active
                ? 'bg-gradient-brand text-white glow-rose'
                : 'glass text-ink-2 hover:text-ink',
            ].join(' ')}
          >
            <div className="text-3xl mb-2">{opt.emoji}</div>
            <div className="font-bold text-lg">{opt.label}</div>
            <div className={`text-xs mt-1 leading-relaxed ${active ? 'text-white/85' : 'text-ink-muted'}`}>
              {opt.sub}
            </div>
          </button>
        )
      })}
    </div>
  )
}
