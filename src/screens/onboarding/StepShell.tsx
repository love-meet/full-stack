import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'

type Props = {
  step: number      // 0-indexed
  total: number
  title: string
  subtitle: string
  children: ReactNode
  canBack: boolean
  canNext: boolean
  /** Why the user can't continue yet — shown by the footer when present. */
  nextHint?: string | null
  isLast: boolean
  submitting: boolean
  errorText?: string | null
  onBack: () => void
  onNext: () => void
}

export default function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  canBack,
  canNext,
  nextHint,
  isLast,
  submitting,
  errorText,
  onBack,
  onNext,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex">
      <BrandPanel step={step} total={total} />

      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Progress bar */}
        <div className="px-5 sm:px-10 pt-6">
          <div className="flex items-center gap-2">
            {Array.from({ length: total }).map((_, i) => {
              const filled = i <= step
              const active = i === step
              return (
                <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-white/8">
                  <motion.div
                    initial={false}
                    animate={{ width: filled ? '100%' : '0%' }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={active ? 'h-full bg-gradient-brand' : 'h-full bg-gradient-warm'}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            {t('onboarding.stepOf', { step: step + 1, total })}
          </div>
        </div>

        {/* Body — animated swap on step change */}
        <div className="flex-1 px-5 sm:px-10 pt-8 pb-28 overflow-y-auto">
          <div className="max-w-xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gradient-warm">
                  {title}
                </h1>
                <p className="mt-1.5 text-sm sm:text-base text-ink-muted">{subtitle}</p>
                <div className="mt-8">{children}</div>
                {errorText && (
                  <p className="mt-4 text-sm text-danger">{errorText}</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="sticky bottom-0 left-0 right-0 glass border-t border-white/5 px-5 sm:px-10 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <button
              onClick={onBack}
              disabled={!canBack}
              className="rounded-full px-5 py-3 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← {t('onboarding.back')}
            </button>
            {/* Inline reason the user can't proceed yet. */}
            <AnimatePresence mode="wait">
              {!canNext && nextHint && (
                <motion.p
                  key={nextHint}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="flex-1 text-center text-xs text-ink-muted px-2 leading-snug"
                >
                  {nextHint}
                </motion.p>
              )}
            </AnimatePresence>
            <div className={!canNext && nextHint ? '' : 'flex-1'} />
            <button
              onClick={onNext}
              disabled={!canNext || submitting}
              className={[
                'rounded-full px-7 py-3 text-sm font-semibold transition-opacity min-w-32 shrink-0',
                canNext && !submitting
                  ? 'bg-gradient-brand text-white glow-rose'
                  : 'bg-surface-3 text-ink-muted',
              ].join(' ')}
            >
              {submitting ? t('onboarding.saving') : isLast ? t('onboarding.enter') : `${t('onboarding.continueLabel')} →`}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function BrandPanel({ step, total }: { step: number; total: number }) {
  const { t } = useTranslation()
  return (
    <aside className="hidden lg:flex relative overflow-hidden w-[42%] max-w-[560px]">
      {/* Hero photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(15,8,20,0.55) 0%, rgba(27,14,38,0.85) 100%), url('/hero.jpeg')",
        }}
      />
      {/* Decorative gradient halo */}
      <div
        aria-hidden
        className="absolute -top-20 -left-20 w-96 h-96 rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(circle, var(--color-magenta) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-35"
        style={{ background: 'radial-gradient(circle, var(--color-rose) 0%, transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end p-10 w-full">
        <div className="space-y-3 max-w-xs">
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            {t('onboarding.stepOf', { step: step + 1, total })}
          </div>
          <h2 className="text-3xl font-extrabold leading-tight text-gradient-warm">
            {t('onboarding.brandTitle')}
          </h2>
          <p className="text-sm text-ink-2 leading-relaxed">
            {t('onboarding.brandSubtitle')}
          </p>
        </div>
      </div>
    </aside>
  )
}
