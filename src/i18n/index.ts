import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import ms from './locales/ms'
import zh from './locales/zh'
import fr from './locales/fr'
import th from './locales/th'
import pt from './locales/pt'
import de from './locales/de'
import es from './locales/es'
import hi from './locales/hi'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type LanguageCode } from './languages'

export const LANGUAGE_STORAGE_KEY = 'lm_lang'

// try/catch: this runs at module scope during i18next init — an unguarded
// localStorage access throws in storage-blocked browsers (Safari/Chrome
// "block all cookies", some embedded webviews), which would crash the whole
// bundle before React ever mounts. Blocked storage just means the language
// gate shows every visit.
export function getStoredLanguage(): LanguageCode | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return SUPPORTED_LANGUAGES.some((l) => l.code === stored) ? (stored as LanguageCode) : null
  } catch {
    return null
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ms: { translation: ms },
    zh: { translation: zh },
    fr: { translation: fr },
    th: { translation: th },
    pt: { translation: pt },
    de: { translation: de },
    es: { translation: es },
    hi: { translation: hi },
  },
  lng: getStoredLanguage() ?? DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

export function setLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch {
    // Storage blocked — the language still switches for this session.
  }
  void i18next.changeLanguage(code)
}

export default i18next
