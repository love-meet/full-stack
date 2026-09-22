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
  lng: getStoredLanguage() ?? systemLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

/**
 * The device's own language, if we speak it.
 *
 * The website never asks — it takes what the browser already states and gets
 * out of the way. Matching is on the base tag only: `pt-BR`, `pt-PT` and `pt`
 * all resolve to `pt`, because our locales are per-language, not per-region.
 * `navigator.languages` is preferred over `navigator.language` since it is the
 * user's ordered preference list — someone whose first choice we don't carry
 * may well have a second we do.
 */
export function systemLanguage(): LanguageCode {
  try {
    const wanted = navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    for (const tag of wanted) {
      const base = String(tag).toLowerCase().split('-')[0]
      const hit = SUPPORTED_LANGUAGES.find((l) => l.code === base)
      if (hit) return hit.code
    }
  } catch { /* no navigator (SSR, odd webview) — fall through */ }
  return DEFAULT_LANGUAGE
}

export function setLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch {
    // Storage blocked — the language still switches for this session.
  }
  void i18next.changeLanguage(code)
}

export default i18next
