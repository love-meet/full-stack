// Shared form state for the branching onboarding wizard.
// Mirrors the field set from _archive/mobile/src/screens/personalForm/, plus
// the new "intent" branch and mandatory photo gallery.

export type Gender = 'male' | 'female' | 'nonbinary' | 'other' | 'prefer_not_to_say'
export type LookingFor = 'serious' | 'casual' | 'friends'
export type Intent = 'relationship' | 'fun' | ''

export const GALLERY_SIZE = 5

export type FormData = {
  // Step 0 — Path. Branches the rest of the wizard.
  intent: Intent

  // Avatar — pre-filled from the OAuth provider's picture if available;
  // user can override by uploading their own.
  avatar: string

  // Step — Name
  firstName: string
  lastName: string
  username: string
  // Transient: live username availability (not persisted). null = unknown
  // / checking; true = free; false = taken or invalid. Gates "Continue".
  usernameAvailable: boolean | null

  // Step — Details (18+ age gate)
  gender: Gender | ''
  dobDay: string   // '' or '1'..'31'
  dobMonth: string // '' or '1'..'12'
  dobYear: string  // '' or '1925'..'(thisYear - 18)'

  // Step — About (relationship path only)
  bio: string
  lookingFor: LookingFor | ''
  hobbies: string[] // min 3, max 5

  // Step — Preferences (relationship path only)
  ageMin: number
  ageMax: number
  showOnlineStatus: boolean
  showDistance: boolean

  // Step — Location. Detected (GPS → coords + place) OR entered manually
  // (country select; lat/lon stay null). Either path satisfies the step.
  address: string
  region: string
  countryCode: string  // ISO 3166-1 alpha-2, e.g. "NG"
  countryName: string  // full name, e.g. "Nigeria"
  lat: number | null
  lon: number | null

  // Step — Gallery (final step, both paths). Fixed-length GALLERY_SIZE
  // array; '' = empty slot. All slots must be filled to finish.
  gallery: string[]
}

export const initialFormData: FormData = {
  intent: '',
  avatar: '',
  firstName: '',
  lastName: '',
  username: '',
  usernameAvailable: null,
  gender: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  bio: '',
  lookingFor: '',
  hobbies: [],
  ageMin: 18,
  ageMax: 35,
  showOnlineStatus: true,
  showDistance: true,
  address: '',
  region: '',
  countryCode: '',
  countryName: '',
  lat: null,
  lon: null,
  gallery: Array(GALLERY_SIZE).fill(''),
}

export type StepProps = {
  data: FormData
  set: (patch: Partial<FormData>) => void
}

export type StepDef = { key: string; title: string; subtitle: string }

/** Minimal shape of react-i18next's `t` — avoids importing it into this data file. */
type TFunc = (key: string, opts?: Record<string, unknown>) => string

/**
 * The wizard's step list depends on `intent`. "Just for fun" skips the
 * detailed relationship questionnaire (about + preferences) and goes
 * straight from the age-gate details step to location + gallery. Until
 * intent is picked (on step 0 itself) we show the longer, relationship-path
 * length so the progress bar doesn't jump on the very first step.
 */
export function stepsForIntent(intent: Intent, t: TFunc): StepDef[] {
  const step = (key: string): StepDef => ({
    key,
    title: t(`onboarding.steps.${key}.title`),
    subtitle: t(`onboarding.steps.${key}.subtitle`, { count: GALLERY_SIZE }),
  })
  const questionnaire = intent === 'fun' ? [] : [step('about'), step('preferences')]
  return [step('path'), step('name'), step('details'), ...questionnaire, step('location'), step('gallery')]
}
