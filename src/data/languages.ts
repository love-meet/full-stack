// Languages offered at signup. Required by §4 — the product asks what you
// speak so the feed and chat can eventually match people who can actually
// talk to each other.
//
// Ordered roughly by where the app has users (Nigeria, Ghana, Kenya, South
// Africa) and then by global reach, so the common picks are near the top
// without the list pretending to be exhaustive. `Other` is the escape hatch.

export type Language = { code: string; name: string }

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'pcm', name: 'Nigerian Pidgin' },
  { code: 'ha', name: 'Hausa' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ig', name: 'Igbo' },
  { code: 'sw', name: 'Swahili' },
  { code: 'tw', name: 'Twi' },
  { code: 'ee', name: 'Ewe' },
  { code: 'ga', name: 'Ga' },
  { code: 'zu', name: 'Zulu' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'Amharic' },
  { code: 'so', name: 'Somali' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'id', name: 'Indonesian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'other', name: 'Other' },
]

export function languageName(code: string | null | undefined): string | null {
  if (!code) return null
  return LANGUAGES.find((l) => l.code === code)?.name ?? code
}
