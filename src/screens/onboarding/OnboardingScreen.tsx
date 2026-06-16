import { useState, useCallback, useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import StepShell from './StepShell'
import { STEPS, initialFormData, type FormData } from './types'
import { useUpdateProfile, useProfile, type ProfileUpdate } from '../../hooks/useProfile'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import LoadingShell from '../../shell/LoadingShell'

import NameStep from './steps/NameStep'
import DetailsStep from './steps/DetailsStep'
import AboutStep from './steps/AboutStep'
import PreferencesStep from './steps/PreferencesStep'
import LocationStep from './steps/LocationStep'

const STEP_COMPONENTS = [NameStep, DetailsStep, AboutStep, PreferencesStep, LocationStep]

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const update = useUpdateProfile()
  const session = useAuth((s) => s.session)
  const profileQuery = useProfile()
  const [step, setStep] = useState(0)
  // Pre-fill the avatar from the OAuth provider's picture if available.
  // Google populates `picture` in user_metadata; our Telegram Edge Function
  // populates `avatar_url`. Either is a fine starting value the user can
  // override with their own upload.
  const [data, setData] = useState<FormData>(() => {
    const meta = session?.user.user_metadata as
      | { picture?: string; avatar_url?: string }
      | undefined
    return { ...initialFormData, avatar: meta?.avatar_url ?? meta?.picture ?? '' }
  })

  // ── Defensive onboarding bypass ─────────────────────────────────────────
  // If we somehow land here but the user has already completed onboarding,
  // skip straight to the feed. Two cases:
  //   1. `onboarded_at` is set — RequireProfile *should* have caught this
  //      already but if there's any stale-cache window we don't want them
  //      to see the wizard again. Cheap sanity guard.
  //   2. `onboarded_at` is null BUT the profile has the load-bearing
  //      onboarding fields filled (display_name + dob + gender). This
  //      backfills returning users whose timestamp didn't persist for
  //      whatever reason — they did the work, they shouldn't have to do
  //      it twice. We set onboarded_at = now() in the background and
  //      navigate them through.
  const backfillRef = useRef(false)
  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    if (p.onboarded_at) {
      // Sanity guard: RequireProfile would normally route them away, but if
      // we're somehow on /onboarding with a completed profile, leave.
      navigate('/feed', { replace: true })
      return
    }
    const looksOnboarded =
      !!(p.display_name || p.first_name) && !!p.dob && !!p.gender
    if (looksOnboarded && !backfillRef.current && !update.isPending) {
      backfillRef.current = true
      void update.mutateAsync({ onboarded_at: new Date().toISOString() })
        .then(() => { navigate('/feed', { replace: true }) })
        .catch(() => { /* fall through to wizard */ backfillRef.current = false })
    }
  }, [profileQuery.data, navigate, update])

  const set = useCallback(
    (patch: Partial<FormData>) => setData((d) => ({ ...d, ...patch })),
    [],
  )

  const isLast = step === STEPS.length - 1
  const { valid: canNext, hint: nextHint } = stepStatus(step, data)
  const canBack = step > 0 && !update.isPending

  const next = useCallback(async () => {
    if (!canNext || update.isPending) return
    if (!isLast) {
      setStep((s) => s + 1)
      return
    }
    // Submit on last step
    try {
      await update.mutateAsync(toProfileUpdate(data))
      // Attribute the referral captured from the invite link, if any.
      const ref = localStorage.getItem('lm_ref')
      if (ref) {
        try { await supabase.rpc('apply_referral', { code: ref }) } catch { /* non-fatal */ }
        localStorage.removeItem('lm_ref')
      }
      navigate('/feed', { replace: true })
    } catch {
      // shown in StepShell via errorText
    }
  }, [canNext, update, isLast, data, navigate])

  function back() {
    if (step > 0) setStep(step - 1)
  }

  // Enter advances the wizard (except while typing in a textarea/select,
  // where Enter has its own meaning). Mirrors a polished web form.
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      void nextRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Block the wizard from painting while we still have any of the above to
  // resolve: profile is loading, profile is already onboarded, or we're
  // backfilling.
  if (profileQuery.isLoading) return <LoadingShell />
  if (profileQuery.data?.onboarded_at) return <Navigate to="/feed" replace />
  if (backfillRef.current) return <LoadingShell />

  const StepBody = STEP_COMPONENTS[step]
  const meta = STEPS[step]

  return (
    <StepShell
      step={step}
      total={STEPS.length}
      title={meta.title}
      subtitle={meta.subtitle}
      canBack={canBack}
      canNext={canNext}
      nextHint={nextHint}
      isLast={isLast}
      submitting={update.isPending}
      errorText={update.error ? (update.error as Error).message : null}
      onBack={back}
      onNext={next}
    >
      <StepBody data={data} set={set} />
    </StepShell>
  )
}

// ---------- validation per step ----------
// Returns whether the step can advance, plus a short reason when it can't —
// so the disabled "Continue" button is never a mystery.

type StepStatus = { valid: boolean; hint: string | null }

function stepStatus(step: number, d: FormData): StepStatus {
  switch (step) {
    case 0: {
      if (!d.firstName.trim() || !d.lastName.trim()) {
        return { valid: false, hint: 'Enter your first and last name.' }
      }
      if (!/^[a-z0-9_]{3,20}$/.test(d.username)) {
        return { valid: false, hint: 'Pick a username — 3+ chars, a–z, 0–9 or _.' }
      }
      if (d.usernameAvailable === null) return { valid: false, hint: 'Checking that username…' }
      if (d.usernameAvailable === false) return { valid: false, hint: 'That username is taken — try another.' }
      return { valid: true, hint: null }
    }
    case 1: {
      if (!d.gender) return { valid: false, hint: 'Select how you identify.' }
      if (!d.dobDay || !d.dobMonth || !d.dobYear) {
        return { valid: false, hint: 'Enter your full date of birth.' }
      }
      const dob = parseDob(d)
      if (!dob.validDate) return { valid: false, hint: "That date doesn't look right." }
      if (dob.age < 18) return { valid: false, hint: 'You must be 18 or older to join.' }
      return { valid: true, hint: null }
    }
    case 2: {
      if (d.bio.trim().length < 3) return { valid: false, hint: 'Add a short bio about you.' }
      if (!d.lookingFor) return { valid: false, hint: "Tell us what you're looking for." }
      if (d.hobbies.length < 3) return { valid: false, hint: 'Pick at least 3 interests.' }
      return { valid: true, hint: null }
    }
    case 3: {
      if (!(d.ageMin >= 18 && d.ageMax >= d.ageMin && d.ageMax <= 100)) {
        return { valid: false, hint: 'Set a valid age range (18–100).' }
      }
      return { valid: true, hint: null }
    }
    case 4: {
      // Require a successful detection: coords present + a country resolved.
      if (d.lat === null || d.lon === null || d.countryName.trim().length === 0) {
        return { valid: false, hint: 'Tap "Add location" to set your location.' }
      }
      return { valid: true, hint: null }
    }
  }
  return { valid: false, hint: null }
}

/** Parse the DOB selects and validate against rollover (e.g. Feb 31). */
function parseDob(d: FormData): { validDate: boolean; age: number } {
  const y = Number(d.dobYear), m = Number(d.dobMonth), day = Number(d.dobDay)
  if (!y || !m || !day) return { validDate: false, age: -1 }
  const dob = new Date(y, m - 1, day)
  const validDate =
    dob.getFullYear() === y && dob.getMonth() === m - 1 && dob.getDate() === day
  if (!validDate) return { validDate: false, age: -1 }
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const md = today.getMonth() - dob.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) age--
  return { validDate: true, age }
}

// ---------- form → DB shape ----------

function toProfileUpdate(d: FormData): ProfileUpdate {
  const dob = `${d.dobYear}-${String(d.dobMonth).padStart(2, '0')}-${String(d.dobDay).padStart(2, '0')}`
  const displayName = `${d.firstName.trim()} ${d.lastName.trim()}`.trim() || null
  return {
    handle: d.username,
    display_name: displayName,
    avatar_url: d.avatar.trim() || null,
    first_name: d.firstName.trim() || null,
    last_name: d.lastName.trim() || null,
    gender: (d.gender || null) as ProfileUpdate['gender'],
    dob,
    bio: d.bio.trim() || null,
    looking_for: (d.lookingFor || null) as ProfileUpdate['looking_for'],
    interests: d.hobbies,
    age_min: d.ageMin,
    age_max: d.ageMax,
    show_online_status: d.showOnlineStatus,
    show_distance: d.showDistance,
    city: d.address.trim() || null,
    region: d.region.trim() || null,
    country_code: d.countryCode.trim() || null,
    country_name: d.countryName.trim() || null,
    lat: d.lat,
    lon: d.lon,
    onboarded_at: new Date().toISOString(),
  }
}
