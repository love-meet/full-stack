import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useProfile } from '../hooks/useProfile'
import { useMatchPreferences, useSaveMatchPreferences } from '../hooks/useMatchPreferences'
import { COUNTRIES, STATES } from '../data/geo'

/** The kind of input each question uses. */
type QKind = 'country' | 'state' | 'choice'

type Question = {
  id: string             // jsonb key
  emoji: string
  topic: string
  /** Tokens: {them} (him/her/them), {they} (he/she/they), {their} (his/her/their). */
  partnerPrompt: string
  selfPrompt: string
  kind: QKind
  options?: string[]
}

const OPTIONS: Record<string, string[]> = {
  career: ['Tech', 'Healthcare', 'Education', 'Business', 'Arts', 'Trades', 'Student', 'Self-employed', 'Civil service', 'Anything'],
  character: ['Kind', 'Ambitious', 'Playful', 'Calm', 'Bold', 'Romantic', 'Funny', 'Loyal', 'Adventurous'],
  color: ['Red', 'Pink', 'Blue', 'Black', 'White', 'Green', 'Yellow', 'Purple', 'Orange', 'Gold', 'Anything'],
  religion: ['Christian', 'Muslim', 'Traditional', 'Spiritual', 'None', 'Prefer not to say', 'Anything'],
  education: ['High school', 'Diploma', "Bachelor's", "Master's", 'PhD', 'Self-taught', 'Anything'],
  height: ['Short', 'Average', 'Tall', 'Very tall'],
  body: ['Slim', 'Average', 'Athletic', 'Curvy', 'Full-figured'],
  smoking: ['Never', 'Sometimes', 'Often', "Don't mind"],
  drinking: ['Never', 'Sometimes', 'Often', "Don't mind"],
  children: ['Yes', 'No', 'Maybe', 'Already have'],
  pets: ['Love them', 'Indifferent', 'Allergic', 'No pets, please'],
  travel: ['Adventurous', 'Relaxed', 'Cultural', 'Foodie', 'Homebody'],
  money: ['Saver', 'Spender', 'Balanced', 'Investor'],
  love_language: ['Words', 'Acts of service', 'Gifts', 'Quality time', 'Touch'],
}

function getQuestions(t: TFunction): Question[] {
  return [
    { id: 'country', emoji: '🌍', topic: t('interview.topics.country'), partnerPrompt: t('interview.partnerPrompts.country'), selfPrompt: t('interview.selfPrompts.country'), kind: 'country' },
    { id: 'state', emoji: '📍', topic: t('interview.topics.state'), partnerPrompt: t('interview.partnerPrompts.state'), selfPrompt: t('interview.selfPrompts.state'), kind: 'state' },
    { id: 'career', emoji: '💼', topic: t('interview.topics.career'), partnerPrompt: t('interview.partnerPrompts.career'), selfPrompt: t('interview.selfPrompts.career'), kind: 'choice', options: OPTIONS.career },
    { id: 'character', emoji: '😊', topic: t('interview.topics.character'), partnerPrompt: t('interview.partnerPrompts.character'), selfPrompt: t('interview.selfPrompts.character'), kind: 'choice', options: OPTIONS.character },
    { id: 'color', emoji: '🎨', topic: t('interview.topics.color'), partnerPrompt: t('interview.partnerPrompts.color'), selfPrompt: t('interview.selfPrompts.color'), kind: 'choice', options: OPTIONS.color },
    { id: 'religion', emoji: '🙏', topic: t('interview.topics.religion'), partnerPrompt: t('interview.partnerPrompts.religion'), selfPrompt: t('interview.selfPrompts.religion'), kind: 'choice', options: OPTIONS.religion },
    { id: 'education', emoji: '🎓', topic: t('interview.topics.education'), partnerPrompt: t('interview.partnerPrompts.education'), selfPrompt: t('interview.selfPrompts.education'), kind: 'choice', options: OPTIONS.education },
    { id: 'height', emoji: '📏', topic: t('interview.topics.height'), partnerPrompt: t('interview.partnerPrompts.height'), selfPrompt: t('interview.selfPrompts.height'), kind: 'choice', options: OPTIONS.height },
    { id: 'body', emoji: '🏃', topic: t('interview.topics.body'), partnerPrompt: t('interview.partnerPrompts.body'), selfPrompt: t('interview.selfPrompts.body'), kind: 'choice', options: OPTIONS.body },
    { id: 'smoking', emoji: '🚭', topic: t('interview.topics.smoking'), partnerPrompt: t('interview.partnerPrompts.smoking'), selfPrompt: t('interview.selfPrompts.smoking'), kind: 'choice', options: OPTIONS.smoking },
    { id: 'drinking', emoji: '🥂', topic: t('interview.topics.drinking'), partnerPrompt: t('interview.partnerPrompts.drinking'), selfPrompt: t('interview.selfPrompts.drinking'), kind: 'choice', options: OPTIONS.drinking },
    { id: 'children', emoji: '👶', topic: t('interview.topics.children'), partnerPrompt: t('interview.partnerPrompts.children'), selfPrompt: t('interview.selfPrompts.children'), kind: 'choice', options: OPTIONS.children },
    { id: 'pets', emoji: '🐾', topic: t('interview.topics.pets'), partnerPrompt: t('interview.partnerPrompts.pets'), selfPrompt: t('interview.selfPrompts.pets'), kind: 'choice', options: OPTIONS.pets },
    { id: 'travel', emoji: '✈️', topic: t('interview.topics.travel'), partnerPrompt: t('interview.partnerPrompts.travel'), selfPrompt: t('interview.selfPrompts.travel'), kind: 'choice', options: OPTIONS.travel },
    { id: 'money', emoji: '💰', topic: t('interview.topics.money'), partnerPrompt: t('interview.partnerPrompts.money'), selfPrompt: t('interview.selfPrompts.money'), kind: 'choice', options: OPTIONS.money },
    { id: 'love_language', emoji: '💞', topic: t('interview.topics.love_language'), partnerPrompt: t('interview.partnerPrompts.love_language'), selfPrompt: t('interview.selfPrompts.love_language'), kind: 'choice', options: OPTIONS.love_language },
  ]
}

type Pron = { them: string; they: string; their: string; Their: string; person: string }

function pronounsFor(g: string | null | undefined, t: TFunction): Pron {
  if (g === 'female') return { them: t('interview.pron.them'), they: t('interview.pron.they'), their: t('interview.pron.their'), Their: t('interview.pron.Their'), person: t('interview.pron.person') }
  if (g === 'male') return { them: t('interview.pron.themF'), they: t('interview.pron.theyF'), their: t('interview.pron.theirF'), Their: t('interview.pron.TheirF'), person: t('interview.pron.personF') }
  return { them: t('interview.pron.themN'), they: t('interview.pron.theyN'), their: t('interview.pron.theirN'), Their: t('interview.pron.TheirN'), person: t('interview.pron.personN') }
}

function applyPron(text: string, p: Pron): string {
  return text
    .replace(/\{them\}/g, p.them)
    .replace(/\{they\}/g, p.they)
    .replace(/\{their\}/g, p.their)
    .replace(/\{Their\}/g, p.Their)
}

export default function InterviewScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useProfile()
  const existing = useMatchPreferences()
  const save = useSaveMatchPreferences()
  const [step, setStep] = useState(0)
  const [partner, setPartner] = useState<Record<string, string>>({})
  const [self, setSelf] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<'free' | 'premium' | 'vip' | null>(null)

  const QUESTIONS = useMemo(() => getQuestions(t), [t])
  const pron = useMemo(() => pronounsFor(profile.data?.gender, t), [profile.data?.gender, t])

  // Pre-fill from any previously-saved answers.
  useMemo(() => {
    if (existing.data) {
      setPartner(existing.data.partner ?? {})
      setSelf(existing.data.self ?? {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data?.user_id])

  const total = QUESTIONS.length + 1 // +1 for the final plan question
  const isFinal = step === QUESTIONS.length

  async function finish(picked: 'free' | 'premium' | 'vip') {
    setPlan(picked)
    // Map the interview choice to the actual DB plan id.
    const planRoute = picked === 'premium' ? '/plans/sweetheart'
      : picked === 'vip' ? '/plans/soulmate'
      : '/feed'
    try {
      await save.mutateAsync({ partner, self, planGoal: picked, completed: true })
    } catch {
      // best-effort: even on save error we still let the user move on
    }
    navigate(planRoute, { replace: true })
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-md mx-auto px-3 h-12 flex items-center justify-between">
          <button
            onClick={() => step === 0 ? navigate(-1) : setStep((s) => s - 1)}
            className="text-ink-2 hover:text-ink text-xl leading-none px-2"
            aria-label={t('post.back')}
          >
            ←
          </button>
          <div className="text-[11px] font-bold text-ink-muted">
            {isFinal ? t('interview.lastQuestion') : t('interview.questionOf', { step: step + 1, total })}
          </div>
          <div className="w-8" aria-hidden />
        </div>
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-gradient-brand transition-all"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6">
        <AnimatePresence mode="wait">
          {!isFinal ? (
            <QuestionStep
              key={QUESTIONS[step].id}
              q={QUESTIONS[step]}
              pron={pron}
              partner={partner[QUESTIONS[step].id] ?? ''}
              self={self[QUESTIONS[step].id] ?? ''}
              partnerCountry={partner.country ?? ''}
              selfCountry={self.country ?? ''}
              onPartner={(v) => setPartner((p) => ({ ...p, [QUESTIONS[step].id]: v }))}
              onSelf={(v) => setSelf((p) => ({ ...p, [QUESTIONS[step].id]: v }))}
              onNext={() => setStep((s) => s + 1)}
            />
          ) : (
            <FinalStep
              key="final"
              pron={pron}
              onPick={finish}
              busy={save.isPending && plan != null}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function QuestionStep({
  q, pron, partner, self, partnerCountry, selfCountry, onPartner, onSelf, onNext,
}: {
  q: Question
  pron: Pron
  partner: string
  self: string
  partnerCountry: string
  selfCountry: string
  onPartner: (v: string) => void
  onSelf: (v: string) => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18 }}
    >
      <div className="text-center mb-6">
        <div className="text-4xl">{q.emoji}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">{q.topic}</div>
      </div>

      <Field label={t('interview.aboutThem', { them: pron.them })} prompt={applyPron(q.partnerPrompt, pron)}>
        <Picker q={q} value={partner} onChange={onPartner} countryCode={partnerCountry} />
      </Field>

      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink-muted">
        <div className="flex-1 h-px bg-white/10" />
        <span>{t('interview.andYou')}</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <Field label={t('interview.aboutYou')} prompt={q.selfPrompt}>
        <Picker q={q} value={self} onChange={onSelf} countryCode={selfCountry} />
      </Field>

      <button
        onClick={onNext}
        disabled={!partner && !self}
        className="mt-7 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-50"
      >
        {t('onboarding.continueLabel')}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-muted">
        {t('interview.answerLaterNote')}
      </p>
    </motion.div>
  )
}

function Field({ label, prompt, children }: { label: string; prompt: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold mb-1.5">{label}</div>
      <p className="text-base text-ink font-semibold mb-2">{prompt}</p>
      {children}
    </div>
  )
}

function Picker({
  q, value, onChange, countryCode,
}: {
  q: Question
  value: string
  onChange: (v: string) => void
  countryCode?: string
}) {
  const { t } = useTranslation()
  if (q.kind === 'country') {
    const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="lm-input w-full">
        <option value="">{t('interview.selectPlaceholder')}</option>
        {sorted.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
    )
  }
  if (q.kind === 'state') {
    const states = countryCode ? STATES[countryCode] : undefined
    if (states && states.length > 0) {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="lm-input w-full">
          <option value="">{t('interview.selectStatePlaceholder')}</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    }
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={countryCode ? t('interview.stateInputPlaceholder') : t('interview.pickCountryFirst')}
        className="lm-input w-full"
        disabled={!countryCode}
        maxLength={60}
      />
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(q.options ?? []).map((opt) => {
        const active = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              active ? 'bg-rose text-white ring-2 ring-rose' : 'glass text-ink-2 hover:text-ink',
            ].join(' ')}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function FinalStep({
  pron, onPick, busy,
}: {
  pron: Pron
  onPick: (p: 'free' | 'premium' | 'vip') => void
  busy: boolean
}) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <div className="text-5xl">🎉</div>
      <h2 className="mt-2 text-2xl font-extrabold text-gradient-warm">{t('interview.finalTitle')}</h2>
      <p className="mt-1 text-sm text-ink-2">{t('interview.finalSubtitle')}</p>
      <p className="mt-1 text-lg font-bold text-ink">{t('interview.finalQuestion', { person: pron.person })}</p>

      <div className="mt-6 space-y-3 text-left">
        <PlanChoice
          tone="gold"
          icon="💎"
          title={t('interview.vip.title')}
          highlight={t('interview.vip.highlight')}
          tagline={t('interview.vip.tagline')}
          benefits={[
            t('interview.vip.benefit1'),
            t('interview.vip.benefit2'),
            t('interview.vip.benefit3'),
            t('interview.vip.benefit4'),
            t('interview.vip.benefit5'),
          ]}
          cta={t('interview.vip.cta')}
          onPick={() => onPick('vip')}
          disabled={busy}
        />
        <PlanChoice
          tone="rose"
          icon="🤝"
          title={t('interview.premium.title')}
          tagline={t('interview.premium.tagline')}
          benefits={[
            t('interview.premium.benefit1'),
            t('interview.premium.benefit2'),
            t('interview.premium.benefit3'),
            t('interview.premium.benefit4'),
            t('interview.premium.benefit5'),
            t('interview.premium.benefit6'),
            t('interview.premium.benefit7'),
            t('interview.premium.benefit8'),
            t('interview.premium.benefit9'),
            t('interview.premium.benefit10'),
            t('interview.premium.benefit11'),
          ]}
          cta={t('interview.premium.cta')}
          onPick={() => onPick('premium')}
          disabled={busy}
        />
        <PlanChoice
          tone="muted"
          icon="😌"
          title={t('interview.free.title')}
          tagline={t('interview.free.tagline')}
          benefits={[
            t('interview.free.benefit1'),
            t('interview.free.benefit2'),
            t('interview.free.benefit3'),
            t('interview.free.benefit4'),
            t('interview.free.benefit5'),
          ]}
          cta={t('interview.free.cta')}
          onPick={() => onPick('free')}
          disabled={busy}
        />
      </div>
    </motion.div>
  )
}

function PlanChoice({
  tone, icon, title, tagline, benefits, cta, onPick, disabled, highlight,
}: {
  tone: 'gold' | 'rose' | 'muted'
  icon: string
  title: string
  tagline: string
  benefits: string[]
  cta: string
  onPick: () => void
  disabled: boolean
  highlight?: string
}) {
  const ring = tone === 'gold' ? 'ring-gold/50'
    : tone === 'rose' ? 'ring-rose/40' : 'ring-white/10'
  const btn = tone === 'muted'
    ? 'glass text-ink-2 hover:text-ink'
    : 'bg-gradient-brand text-white glow-rose'
  return (
    <div className={`relative glass rounded-2xl p-4 ring-1 ${ring}`}>
      {highlight && (
        <div className="-mt-1 mb-2 inline-block rounded-full px-2.5 py-0.5 bg-gold/15 ring-1 ring-gold/40 text-[10px] uppercase tracking-wider font-extrabold text-gold">
          👑 {highlight}
        </div>
      )}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-ink">{title}</div>
          <p className="text-[12px] text-ink-2 mt-0.5">{tagline}</p>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {benefits.map((b) => (
          <li key={b} className="text-[12px] text-ink-2 flex items-start gap-1.5">
            <span className="text-rose mt-0.5">✓</span><span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onPick}
        disabled={disabled}
        className={`mt-3 w-full rounded-full py-2.5 text-sm font-bold transition-opacity disabled:opacity-50 ${btn}`}
      >
        {cta}
      </button>
    </div>
  )
}
