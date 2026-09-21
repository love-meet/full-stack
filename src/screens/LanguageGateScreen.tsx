import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LanguageCode } from '../i18n/languages'
import LanguageSelect from '../components/LanguageSelect'
import { setLanguage } from '../i18n'

type Props = {
  onDone: () => void
}

/**
 * Shown before anything else — including the landing page — on first
 * visit. Language choice persists in localStorage (see i18n/index.ts)
 * so this only appears once per device.
 */
export default function LanguageGateScreen({ onDone }: Props) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState<LanguageCode>(i18n.language as LanguageCode)

  function confirm() {
    setLanguage(selected)
    onDone()
  }

  return (
    <section className="min-h-screen grid place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-ink text-center">{t('languageGate.title')}</h1>
        <p className="mt-2 text-sm text-ink-muted text-center">{t('languageGate.subtitle')}</p>

        <div className="mt-8">
          <LanguageSelect value={selected} onChange={setSelected} />
        </div>

        <button
          onClick={confirm}
          className="mt-6 w-full rounded-full px-9 py-3.5 bg-gradient-brand text-white font-bold tracking-wide glow-rose transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {t('languageGate.continue')}
        </button>
      </div>
    </section>
  )
}
