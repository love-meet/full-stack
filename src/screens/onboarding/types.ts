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

const PATH_STEP: StepDef = {
  key: 'path',
  title: 'What brings you to Love meet?',
  subtitle: 'Pick what fits — you can always explore more later.',
}
const NAME_STEP: StepDef = {
  key: 'name',
  title: 'Tell us about you',
  subtitle: 'What should we call you?',
}
const DETAILS_STEP: StepDef = {
  key: 'details',
  title: 'A bit more',
  subtitle: 'This helps us get to know you.',
}
const ABOUT_STEP: StepDef = {
  key: 'about',
  title: 'What are you into',
  subtitle: 'And what are you looking for?',
}
const PREFERENCES_STEP: StepDef = {
  key: 'preferences',
  title: 'Your preferences',
  subtitle: 'Who would you like to meet?',
}
const LOCATION_STEP: StepDef = {
  key: 'location',
  title: 'Where are you',
  subtitle: 'So we can find people near you.',
}
const GALLERY_STEP: StepDef = {
  key: 'gallery',
  title: 'Add your photos',
  subtitle: `Add ${GALLERY_SIZE} photos for your feed gallery.`,
}

/**
 * The wizard's step list depends on `intent`. "Just for fun" skips the
 * detailed relationship questionnaire (about + preferences) and goes
 * straight from the age-gate details step to location + gallery. Until
 * intent is picked (on step 0 itself) we show the longer, relationship-path
 * length so the progress bar doesn't jump on the very first step.
 */
export function stepsForIntent(intent: Intent): StepDef[] {
  const questionnaire = intent === 'fun' ? [] : [ABOUT_STEP, PREFERENCES_STEP]
  return [PATH_STEP, NAME_STEP, DETAILS_STEP, ...questionnaire, LOCATION_STEP, GALLERY_STEP]
}
