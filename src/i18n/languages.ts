export type LanguageCode = 'en' | 'ms' | 'zh' | 'fr' | 'th' | 'pt' | 'de' | 'es' | 'hi'

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export const SUPPORTED_LANGUAGES: { code: LanguageCode; nativeName: string; flag: string }[] = [
  { code: 'en', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ms', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'zh', nativeName: '中文', flag: '🇨🇳' },
  { code: 'fr', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'th', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'pt', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'de', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', nativeName: 'Español', flag: '🇨🇴' },
  { code: 'hi', nativeName: 'हिन्दी', flag: '🇮🇳' },
]
