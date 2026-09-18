// Shared form state for onboarding.
//
// §4: signup captures the minimum the product cannot run without, and nothing
// else. That is gender, country/state/city, language, username and a profile
// picture. Everything that used to be here — bio, relationship intent,
// interests, the age range, the privacy toggles — moved to Profile, where the
// user adds it whenever they feel like it and is never blocked on it.
//
// Date of birth is the one required field beyond §4's list. Love meet is
// 18+: the terms say so, the Naughty room is age-gated, and the store review
// guidelines require it. The product genuinely cannot run without knowing the
// user is an adult, which is the test §4 sets.

export type Gender = 'male' | 'female' | 'nonbinary' | 'other' | 'prefer_not_to_say'

export type FormData = {
  // Step 1 — You
  username: string
  // Transient: live username availability (not persisted). null = unknown
  // / checking; true = free; false = taken or invalid. Gates "Continue".
  usernameAvailable: boolean | null
  gender: Gender | ''
  dobDay: string   // '' or '1'..'31'
  dobMonth: string // '' or '1'..'12'
  dobYear: string  // '' or '1925'..'(thisYear - 18)'

  // Step 2 — Where you are
  countryCode: string  // ISO 3166-1 alpha-2, e.g. "NG"
  countryName: string  // full name, e.g. "Nigeria"
  region: string       // state / province
  city: string
  language: string     // code from src/data/languages.ts

  // Step 3 — Your picture. Either an uploaded URL or one of the suggested
  // images; both land in the same field. `suggested` only tracks which chip
  // is highlighted, so re-picking a suggestion after an upload reads right.
  avatar: string
  avatarIsSuggested: boolean
}

export const initialFormData: FormData = {
  username: '',
  usernameAvailable: null,
  gender: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  countryCode: '',
  countryName: '',
  region: '',
  city: '',
  language: '',
  avatar: '',
  avatarIsSuggested: false,
}

export type StepProps = {
  data: FormData
  set: (patch: Partial<FormData>) => void
}

export const STEPS = [
  { key: 'you',      title: 'Who you are',    subtitle: 'Pick a username and tell us how you identify.' },
  { key: 'where',    title: 'Where you are',  subtitle: 'So we can show you people nearby who speak your language.' },
  { key: 'picture',  title: 'Your picture',   subtitle: 'The one thing people see first.' },
] as const
