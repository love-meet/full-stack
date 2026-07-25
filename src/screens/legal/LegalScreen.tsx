import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

type Kind = 'privacy' | 'terms' | 'about' | 'help'
type Section = { heading: string; body: string }
type Doc = { title: string; subtitle: string; sections: Section[] }

export default function LegalScreen() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { kind = 'privacy' } = useParams<{ kind: Kind }>()
  const validKind: Kind = ['privacy', 'terms', 'about', 'help'].includes(kind) ? (kind as Kind) : 'privacy'
  const doc = t(`legal.${validKind}`, { returnObjects: true }) as Doc

  return (
    <div className="min-h-screen text-ink">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('post.back')}
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">{doc.title}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-5 sm:px-8 py-6 pb-24">
        <h1 className="text-3xl font-extrabold text-gradient-warm tracking-tight">
          {doc.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{doc.subtitle}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink-muted font-bold">
          {t('legal.lastUpdated')}
        </p>

        <div className="mt-8 space-y-7">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-extrabold text-ink mb-1.5">{s.heading}</h2>
              <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
