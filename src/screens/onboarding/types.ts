// Shared form state for the 5-step onboarding wizard.
// Mirrors the field set from _archive/mobile/src/screens/personalForm/.

export type Gender = 'male' | 'female' | 'nonbinary' | 'other' | 'prefer_not_to_say'
export type LookingFor = 'serious' | 'casual' | 'friends'

export type FormData = {
  // Avatar — pre-filled from the OAuth provider's picture if available;
  // user can override by uploading their own.
  avatar: string

  // Step 1 — Name
  firstName: string
  lastName: string
  username: string
  // Transient: live username availability (not persisted). null = unknown
  // / checking; true = free; false = taken or invalid. Gates "Continue".
  usernameAvailable: boolean | null

  // Step 2 — Details
  gender: Gender | ''
  dobDay: string   // '' or '1'..'31'
  dobMonth: string // '' or '1'..'12'
  dobYear: string  // '' or '1925'..'(thisYear - 18)'

  // Step 3 — About
  bio: string
  lookingFor: LookingFor | ''
  hobbies: string[] // min 3, max 5

  // Step 4 — Preferences
  ageMin: number
  ageMax: number
  showOnlineStatus: boolean
  showDistance: boolean

  // Step 5 — Location. Detected (GPS → coords + place) OR entered manually
  // (country select; lat/lon stay null). Either path satisfies the step.
  address: string
  region: string
  countryCode: string  // ISO 3166-1 alpha-2, e.g. "NG"
  countryName: string  // full name, e.g. "Nigeria"
  lat: number | null
  lon: number | null
}

export const initialFormData: FormData = {
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
}

export type StepProps = {
  data: FormData
  set: (patch: Partial<FormData>) => void
}

export const STEPS = [
  { key: 'name',        title: 'Tell us about you',     subtitle: 'What should we call you?' },
  { key: 'details',     title: 'A bit more',             subtitle: 'This helps us get to know you.' },
  { key: 'about',       title: 'What are you into',      subtitle: 'And what are you looking for?' },
  { key: 'preferences', title: 'Your preferences',       subtitle: 'Who would you like to meet?' },
  { key: 'location',    title: 'Where are you',          subtitle: 'So we can find people near you.' },
] as const
