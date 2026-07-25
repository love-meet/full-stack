import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { stagger, itemUp } from '../shell/motion'

type Step = { emoji: string; title: string; body: string; to?: string; cta?: string }

function getSteps(t: TFunction): Step[] {
  return [
    {
      emoji: '✨',
      title: t('guide.step1Title'),
      body: t('guide.step1Body'),
      to: '/profile/edit',
      cta: t('guide.step1Cta'),
    },
    {
      emoji: '🧭',
      title: t('guide.step2Title'),
      body: t('guide.step2Body'),
      to: '/explore',
      cta: t('guide.step2Cta'),
    },
    {
      emoji: '💬',
      title: t('guide.step3Title'),
      body: t('guide.step3Body'),
      to: '/feed',
      cta: t('guide.step3Cta'),
    },
    {
      emoji: '🎁',
      title: t('guide.step4Title'),
      body: t('guide.step4Body'),
    },
    {
      emoji: '💸',
      title: t('guide.step5Title'),
      body: t('guide.step5Body'),
      to: '/affiliate',
      cta: t('guide.step5Cta'),
    },
    {
      emoji: '👑',
      title: t('guide.step6Title'),
      body: t('guide.step6Body'),
      to: '/subscription',
      cta: t('guide.step6Cta'),
    },
    {
      emoji: '💰',
      title: t('guide.step7Title'),
      body: t('guide.step7Body'),
      to: '/wallet/deposit',
      cta: t('guide.step7Cta'),
    },
  ]
}

export default function GuideScreen() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const STEPS = getSteps(t)
  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{t('guide.headerTitle')}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">💕</div>
          <h1 className="text-2xl font-extrabold text-gradient-warm">{t('guide.welcome')}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {t('guide.subhead')}
          </p>
        </div>

        <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="visible">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} variants={itemUp} className="glass rounded-2xl p-4 flex gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl bg-white/5">
                {s.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-ink">
                  <span className="text-ink-muted mr-1">{i + 1}.</span>{s.title}
                </div>
                <p className="text-sm text-ink-2 mt-0.5">{s.body}</p>
                {s.to && (
                  <button
                    onClick={() => navigate(s.to!)}
                    className="mt-2 text-sm font-semibold text-rose hover:underline"
                  >
                    {s.cta} →
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <button
          onClick={() => navigate('/feed')}
          className="mt-6 w-full rounded-full py-3 text-sm font-bold bg-gradient-brand text-white glow-rose"
        >
          {t('guide.startExploring')}
        </button>
      </main>
    </div>
  )
}
