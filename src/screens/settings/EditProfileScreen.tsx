import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useProfile,
  useUpdateProfile,
  checkUsernameAvailable,
  type Profile,
  type ProfileUpdate,
} from '../../hooks/useProfile'
import { useUploadAvatar } from '../../hooks/useUploadAvatar'
import { avatarFor } from '../../lib/avatar'

const GENDERS: Profile['gender'][] = ['female', 'male', 'nonbinary', 'other', 'prefer_not_to_say']
const LOOKING: NonNullable<Profile['looking_for']>[] = ['serious', 'casual', 'friends']

type Form = {
  avatar_url: string
  display_name: string
  handle: string
  bio: string
  gender: Profile['gender']
  dob: string
  looking_for: Profile['looking_for']
  interests: string
  country_name: string
  city: string
  age_min: string
  age_max: string
  show_online_status: boolean
  show_distance: boolean
}

function fromProfile(p: Profile): Form {
  return {
    avatar_url: p.avatar_url ?? '',
    display_name: p.display_name ?? '',
    handle: p.handle ?? '',
    bio: p.bio ?? '',
    gender: p.gender,
    dob: p.dob ?? '',
    looking_for: p.looking_for,
    interests: (p.interests ?? []).join(', '),
    country_name: p.country_name ?? '',
    city: p.city ?? '',
    age_min: p.age_min != null ? String(p.age_min) : '',
    age_max: p.age_max != null ? String(p.age_max) : '',
    show_online_status: p.show_online_status,
    show_distance: p.show_distance,
  }
}

function toPatch(form: Form, original: Profile): ProfileUpdate {
  const patch: ProfileUpdate = {}
  if (form.avatar_url !== (original.avatar_url ?? '')) patch.avatar_url = form.avatar_url || null
  if (form.display_name !== (original.display_name ?? '')) patch.display_name = form.display_name.trim() || null
  if (form.handle !== (original.handle ?? '')) patch.handle = form.handle.trim() || null
  if (form.bio !== (original.bio ?? '')) patch.bio = form.bio.trim() || null
  if (form.gender !== original.gender) patch.gender = form.gender
  if (form.dob !== (original.dob ?? '')) patch.dob = form.dob || null
  if (form.looking_for !== original.looking_for) patch.looking_for = form.looking_for
  const nextInterests = form.interests
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (JSON.stringify(nextInterests) !== JSON.stringify(original.interests ?? [])) {
    patch.interests = nextInterests
  }
  if (form.country_name !== (original.country_name ?? '')) patch.country_name = form.country_name.trim() || null
  if (form.city !== (original.city ?? '')) patch.city = form.city.trim() || null
  const ageMin = form.age_min === '' ? null : Number(form.age_min)
  if (ageMin !== original.age_min) patch.age_min = ageMin
  const ageMax = form.age_max === '' ? null : Number(form.age_max)
  if (ageMax !== original.age_max) patch.age_max = ageMax
  if (form.show_online_status !== original.show_online_status) patch.show_online_status = form.show_online_status
  if (form.show_distance !== original.show_distance) patch.show_distance = form.show_distance
  return patch
}

export default function EditProfileScreen() {
  const navigate = useNavigate()
  const profileQ = useProfile()
  const update = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [savedFlash, setSavedFlash] = useState(false)

  // Seed the form from the loaded profile.
  useEffect(() => {
    if (profileQ.data && !form) setForm(fromProfile(profileQ.data))
  }, [profileQ.data, form])

  // Debounced handle availability check.
  const original = profileQ.data
  useEffect(() => {
    if (!form || !original) return
    const trimmed = form.handle.trim()
    if (!trimmed || trimmed === (original.handle ?? '')) {
      setHandleStatus('idle')
      return
    }
    setHandleStatus('checking')
    const t = window.setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(trimmed)
        setHandleStatus(ok ? 'available' : 'taken')
      } catch {
        setHandleStatus('idle')
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [form?.handle, original])

  if (profileQ.isLoading || !profileQ.data || !form) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }

  const profile = profileQ.data

  // Nothing to save until the form actually differs from the saved profile.
  const dirty = Object.keys(toPatch(form, profile)).length > 0
  const busy = update.isPending || uploadAvatar.isPending
  const canSave = dirty && !busy

  function set<K extends keyof Form>(key: K, val: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: val } : f))
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const url = await uploadAvatar.mutateAsync(file)
      set('avatar_url', url)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save() {
    if (!form) return
    setError(null)

    // Light validation
    const handle = form.handle.trim()
    if (!handle) { setError('Handle can\'t be empty.'); return }
    if (!/^[a-z0-9_]{3,24}$/i.test(handle)) {
      setError('Handle must be 3–24 chars, letters/numbers/underscore.')
      return
    }
    if (handle !== (profile.handle ?? '') && handleStatus === 'taken') {
      setError('That handle is already taken.')
      return
    }
    const ageMin = form.age_min === '' ? null : Number(form.age_min)
    const ageMax = form.age_max === '' ? null : Number(form.age_max)
    if (ageMin != null && (ageMin < 18 || ageMin > 99)) { setError('Min age must be 18–99.'); return }
    if (ageMax != null && (ageMax < 18 || ageMax > 99)) { setError('Max age must be 18–99.'); return }
    if (ageMin != null && ageMax != null && ageMin > ageMax) {
      setError('Min age can\'t be greater than max age.')
      return
    }

    const patch = toPatch(form, profile)
    if (Object.keys(patch).length === 0) {
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1500)
      return
    }

    try {
      await update.mutateAsync(patch)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen text-ink pb-32">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2"
          >
            ←
          </button>
          <div className="flex-1 text-center text-ink font-bold">Edit profile</div>
          <button
            onClick={save}
            disabled={!canSave}
            className={[
              'text-sm font-bold px-3 py-1.5 rounded-full transition-opacity',
              !canSave
                ? 'opacity-60 bg-surface-3 text-ink-muted cursor-not-allowed'
                : 'bg-gradient-brand text-white glow-rose',
            ].join(' ')}
          >
            {update.isPending ? 'Saving…' : savedFlash ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6 space-y-8">
        {error && (
          <div className="glass rounded-2xl p-3 text-sm text-danger border border-danger/30">
            {error}
          </div>
        )}

        {/* --- Avatar + basics --- */}
        <Section title="Photo &amp; basics">
          <AvatarPicker
            url={form.avatar_url || avatarFor(profile)}
            busy={uploadAvatar.isPending}
            onPick={onPickAvatar}
          />

          <Field label="Display name">
            <input
              type="text"
              maxLength={60}
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              className="lm-input"
              placeholder="Your name"
            />
          </Field>

          <Field
            label="Handle"
            hint={
              handleStatus === 'checking'
                ? 'Checking…'
                : handleStatus === 'available'
                ? <span className="text-success">available ✓</span>
                : handleStatus === 'taken'
                ? <span className="text-danger">taken</span>
                : '3–24 chars · letters, numbers, underscore'
            }
          >
            <div className="lm-input flex items-center gap-1">
              <span className="text-ink-muted">@</span>
              <input
                type="text"
                maxLength={24}
                value={form.handle}
                onChange={(e) => set('handle', e.target.value.replace(/\s+/g, ''))}
                className="flex-1 bg-transparent outline-none text-ink"
                placeholder="yourhandle"
              />
            </div>
          </Field>

          <Field label="Bio" hint={`${form.bio.length}/240`}>
            <textarea
              value={form.bio}
              onChange={(e) => set('bio', e.target.value.slice(0, 240))}
              rows={3}
              className="lm-input resize-none leading-snug no-scrollbar"
              placeholder="A line about you"
            />
          </Field>
        </Section>

        {/* --- Identity --- */}
        <Section title="Identity">
          <Field label="Gender">
            <div className="flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <Chip
                  key={g ?? 'null'}
                  active={form.gender === g}
                  onClick={() => set('gender', g)}
                >
                  {labelGender(g)}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Date of birth" hint="Used for age — only your age is shown to others">
            <input
              type="date"
              value={form.dob}
              onChange={(e) => set('dob', e.target.value)}
              className="lm-input"
              max="2010-12-31"
            />
          </Field>
        </Section>

        {/* --- Preferences --- */}
        <Section title="Preferences">
          <Field label="Looking for">
            <div className="flex flex-wrap gap-2">
              {LOOKING.map((l) => (
                <Chip
                  key={l}
                  active={form.looking_for === l}
                  onClick={() => set('looking_for', l)}
                >
                  {l}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Age range">
            <div className="flex items-center gap-3">
              <input
                type="number"
                inputMode="numeric"
                value={form.age_min}
                onChange={(e) => set('age_min', e.target.value)}
                min={18}
                max={99}
                className="lm-input w-24"
                placeholder="18"
              />
              <span className="text-ink-muted">to</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.age_max}
                onChange={(e) => set('age_max', e.target.value)}
                min={18}
                max={99}
                className="lm-input w-24"
                placeholder="60"
              />
            </div>
          </Field>

          <Field label="Interests" hint="Comma-separated · e.g. travel, music, gym">
            <textarea
              value={form.interests}
              onChange={(e) => set('interests', e.target.value)}
              rows={2}
              className="lm-input resize-none no-scrollbar"
              placeholder="travel, music, gym"
            />
          </Field>
        </Section>

        {/* --- Location --- */}
        <Section title="Location">
          <Field label="Country">
            <input
              type="text"
              value={form.country_name}
              onChange={(e) => set('country_name', e.target.value)}
              className="lm-input"
              placeholder="Nigeria"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              className="lm-input"
              placeholder="Lagos"
            />
          </Field>
        </Section>

        {/* --- Privacy --- */}
        <Section title="Privacy">
          <Toggle
            label="Show online status"
            hint="Other users see the green dot when you're connected."
            checked={form.show_online_status}
            onChange={(v) => set('show_online_status', v)}
          />
          <Toggle
            label="Show distance"
            hint="Show how far away you are on your profile and in cards."
            checked={form.show_distance}
            onChange={(v) => set('show_distance', v)}
          />
        </Section>
      </main>
    </div>
  )
}

// ---------- form atoms ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-ink-2 mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-ink-muted mt-1">{hint}</div>}
    </label>
  )
}

function Chip({
  active, onClick, children,
}: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
        active
          ? 'bg-gradient-brand text-white shadow shadow-rose/30'
          : 'glass text-ink-2 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Toggle({
  label, hint, checked, onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {hint && <div className="text-[11px] text-ink-muted mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={[
          'shrink-0 relative w-11 h-6 rounded-full transition-colors',
          checked ? 'bg-rose' : 'bg-surface-3',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

function AvatarPicker({
  url, busy, onPick,
}: { url: string; busy: boolean; onPick: (f: File | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-4">
      <img
        src={url}
        alt=""
        className="w-20 h-20 rounded-full object-cover border-2 border-magenta"
      />
      <div className="flex-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={[
            'rounded-full px-4 py-2 text-sm font-bold',
            busy ? 'bg-surface-3 text-ink-muted' : 'bg-gradient-brand text-white glow-rose',
          ].join(' ')}
        >
          {busy ? 'Uploading…' : 'Change photo'}
        </button>
        <p className="text-[11px] text-ink-muted mt-1.5">Max 4 MB · JPG / PNG / GIF</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files?.[0])
            // reset so picking the same file again still fires onChange
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function labelGender(g: Profile['gender']): string {
  switch (g) {
    case 'female': return 'Female'
    case 'male': return 'Male'
    case 'nonbinary': return 'Nonbinary'
    case 'other': return 'Other'
    case 'prefer_not_to_say': return 'Rather not say'
    default: return 'Unspecified'
  }
}
