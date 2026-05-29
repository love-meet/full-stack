import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProfile } from '../hooks/useProfile'
import { useMatchPreferences, useSaveMatchPreferences } from '../hooks/useMatchPreferences'
import { COUNTRIES } from '../data/geo'

/** The kind of input each question uses. */
type QKind = 'country' | 'choice'

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

const QUESTIONS: Question[] = [
  {
    id: 'country', emoji: '🌍', topic: 'Where from',
    partnerPrompt: 'Where would you like {them} to come from?',
    selfPrompt: 'And where are you from?',
    kind: 'country',
  },
  {
    id: 'career', emoji: '💼', topic: 'Career',
    partnerPrompt: 'What kind of work do you find attractive in {them}?',
    selfPrompt: 'What do you do?',
    kind: 'choice',
    options: ['Tech', 'Healthcare', 'Education', 'Business', 'Arts', 'Trades', 'Student', 'Self-employed', 'Civil service', 'Other'],
  },
  {
    id: 'character', emoji: '😊', topic: 'Character',
    partnerPrompt: 'One word that describes {them}?',
    selfPrompt: 'One word that describes you?',
    kind: 'choice',
    options: ['Kind', 'Ambitious', 'Playful', 'Calm', 'Bold', 'Romantic', 'Funny', 'Loyal', 'Adventurous'],
  },
  {
    id: 'color', emoji: '🎨', topic: 'Favourite colour',
    partnerPrompt: "{Their} favourite colour?",
    selfPrompt: 'And yours?',
    kind: 'choice',
    options: ['Red', 'Pink', 'Blue', 'Black', 'White', 'Green', 'Yellow', 'Purple', 'Orange', 'Gold', 'Other'],
  },
  {
    id: 'religion', emoji: '🙏', topic: 'Faith',
    partnerPrompt: "{Their} faith or spirituality?",
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Christian', 'Muslim', 'Traditional', 'Spiritual', 'None', 'Prefer not to say', 'Other'],
  },
  {
    id: 'education', emoji: '🎓', topic: 'Education',
    partnerPrompt: "{Their} education?",
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['High school', 'Diploma', "Bachelor's", "Master's", 'PhD', 'Self-taught', 'Other'],
  },
  {
    id: 'height', emoji: '📏', topic: 'Height',
    partnerPrompt: '{Their} height?',
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Short', 'Average', 'Tall', 'Very tall'],
  },
  {
    id: 'body', emoji: '🏃', topic: 'Body type',
    partnerPrompt: '{Their} body type?',
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Slim', 'Average', 'Athletic', 'Curvy', 'Full-figured'],
  },
  {
    id: 'smoking', emoji: '🚭', topic: 'Smoking',
    partnerPrompt: 'Do you mind if {they} smoke?',
    selfPrompt: 'And you?',
    kind: 'choice',
    options: ['Never', 'Sometimes', 'Often', "Don't mind"],
  },
  {
    id: 'drinking', emoji: '🥂', topic: 'Drinking',
    partnerPrompt: '{They} drink?',
    selfPrompt: 'You?',
    kind: 'choice',
    options: ['Never', 'Sometimes', 'Often', "Don't mind"],
  },
  {
    id: 'children', emoji: '👶', topic: 'Children',
    partnerPrompt: '{They} want children?',
    selfPrompt: 'You?',
    kind: 'choice',
    options: ['Yes', 'No', 'Maybe', 'Already have'],
  },
  {
    id: 'pets', emoji: '🐾', topic: 'Pets',
    partnerPrompt: '{Their} love for pets?',
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Love them', 'Indifferent', 'Allergic', 'No pets, please'],
  },
  {
    id: 'travel', emoji: '✈️', topic: 'Travel style',
    partnerPrompt: '{Their} travel style?',
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Adventurous', 'Relaxed', 'Cultural', 'Foodie', 'Homebody'],
  },
  {
    id: 'money', emoji: '💰', topic: 'Money',
    partnerPrompt: '{Their} money style?',
    selfPrompt: 'Yours?',
    kind: 'choice',
    options: ['Saver', 'Spender', 'Balanced', 'Investor'],
  },
  {
    id: 'love_language', emoji: '💞', topic: 'Love language',
    partnerPrompt: 'How does {they} like to be loved?',
    selfPrompt: 'How do you like to be loved?',
    kind: 'choice',
    options: ['Words', 'Acts of service', 'Gifts', 'Quality time', 'Touch'],
  },
]

type Pron = { them: string; they: string; their: string; Their: string; person: string }

function pronounsFor(g: string | null | undefined): Pron {
  if (g === 'female') return { them: 'him', they: 'he', their: 'his', Their: 'His', person: 'man' }
  if (g === 'male') return { them: 'her', they: 'she', their: 'her', Their: 'Her', person: 'woman' }
  return { them: 'them', they: 'they', their: 'their', Their: 'Their', person: 'person' }
}

function applyPron(text: string, p: Pron): string {
  return text
    .replace(/\{them\}/g, p.them)
    .replace(/\{they\}/g, p.they)
    .replace(/\{their\}/g, p.their)
    .replace(/\{Their\}/g, p.Their)
}

export default function InterviewScreen() {
  const navigate = useNavigate()
  const profile = useProfile()
  const existing = useMatchPreferences()
  const save = useSaveMatchPreferences()
  const [step, setStep] = useState(0)
  const [partner, setPartner] = useState<Record<string, string>>({})
  const [self, setSelf] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<'free' | 'premium' | 'vip' | null>(null)

  const pron = useMemo(() => pronounsFor(profile.data?.gender), [profile.data?.gender])

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
    try {
      await save.mutateAsync({ partner, self, planGoal: picked, completed: true })
      if (picked === 'free') navigate('/feed', { replace: true })
      else navigate('/subscription', { replace: true })
    } catch (e) {
      // best-effort: even on save error we still let the user move on
      navigate(picked === 'free' ? '/feed' : '/subscription', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-md mx-auto px-3 h-12 flex items-center justify-between">
          <button
            onClick={() => step === 0 ? navigate(-1) : setStep((s) => s - 1)}
            className="text-ink-2 hover:text-ink text-xl leading-none px-2"
            aria-label="Back"
          >
            ←
          </button>
          <div className="text-[11px] font-bold text-ink-muted">
            {isFinal ? `Last question` : `Question ${step + 1} of ${total}`}
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
  q, pron, partner, self, onPartner, onSelf, onNext,
}: {
  q: Question
  pron: Pron
  partner: string
  self: string
  onPartner: (v: string) => void
  onSelf: (v: string) => void
  onNext: () => void
}) {
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

      <Field label={`About ${pron.them}`} prompt={applyPron(q.partnerPrompt, pron)}>
        <Picker q={q} value={partner} onChange={onPartner} />
      </Field>

      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink-muted">
        <div className="flex-1 h-px bg-white/10" />
        <span>and you?</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <Field label="About you" prompt={q.selfPrompt}>
        <Picker q={q} value={self} onChange={onSelf} />
      </Field>

      <button
        onClick={onNext}
        disabled={!partner && !self}
        className="mt-7 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-50"
      >
        Continue
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-muted">
        You can answer one side now and update later in settings.
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

function Picker({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  if (q.kind === 'country') {
    const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="lm-input w-full">
        <option value="">Select…</option>
        {sorted.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <div className="text-5xl">🎉</div>
      <h2 className="mt-2 text-2xl font-extrabold text-gradient-warm">You're good to go!</h2>
      <p className="mt-1 text-sm text-ink-2">One last question:</p>
      <p className="mt-1 text-lg font-bold text-ink">What kind of {pron.person} do you want?</p>

      <div className="mt-6 space-y-3 text-left">
        <PlanChoice
          tone="gold"
          icon="💎"
          title="A rich one"
          tagline="Unlock VIP — surface to the most verified, premium matches."
          benefits={['Everything in Premium', 'Nationality verification', 'Face verification', 'Top priority with verified hearts']}
          cta="Unlock VIP"
          onPick={() => onPick('vip')}
          disabled={busy}
        />
        <PlanChoice
          tone="rose"
          icon="🤝"
          title="A middle-class one"
          tagline="Premium — be seen, be heard, be unmissable."
          benefits={['Boosted visibility & recommendations', 'Create groups & host games', 'Unlimited posts', 'Choose who can message you', 'No ads · blue verified tick']}
          cta="Get Premium"
          onPick={() => onPick('premium')}
          disabled={busy}
        />
        <PlanChoice
          tone="muted"
          icon="😌"
          title="I'm just there for the ride"
          tagline="Free — limited visibility, but you can still join games and meet people."
          benefits={['3 posts a week', 'Default chat & privacy', 'Join groups & games others host']}
          cta="Stay on Free"
          onPick={() => onPick('free')}
          disabled={busy}
        />
      </div>
    </motion.div>
  )
}

function PlanChoice({
  tone, icon, title, tagline, benefits, cta, onPick, disabled,
}: {
  tone: 'gold' | 'rose' | 'muted'
  icon: string
  title: string
  tagline: string
  benefits: string[]
  cta: string
  onPick: () => void
  disabled: boolean
}) {
  const ring = tone === 'gold' ? 'ring-gold/50'
    : tone === 'rose' ? 'ring-rose/40' : 'ring-white/10'
  const btn = tone === 'muted'
    ? 'glass text-ink-2 hover:text-ink'
    : 'bg-gradient-brand text-white glow-rose'
  return (
    <div className={`relative glass rounded-2xl p-4 ring-1 ${ring}`}>
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
