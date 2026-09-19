import { useState } from 'react'
import type { StepProps } from '../types'
import { COUNTRIES, STATES, matchRegion } from '../../../data/geo'
import { LANGUAGES } from '../../../data/languages'

type DetectStatus = 'idle' | 'asking' | 'error'

/**
 * Country, state, city and language — all four required by §4.
 *
 * The selects are the primary path, not a fallback. GPS used to be the only
 * way through this step, which meant a permission prompt stood between a new
 * user and the app; now "Use my location" just fills the fields in and any
 * failure costs nothing.
 */
export default function WhereStep({ data, set }: StepProps) {
  const [status, setStatus] = useState<DetectStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const states = STATES[data.countryCode]
  // Locale-aware sort so accented names land in the right place (Åland near
  // A, Réunion near R).
  const sortedCountries = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

  function pickCountry(code: string) {
    const obj = COUNTRIES.find((c) => c.code === code)
    set({
      countryCode: code,
      countryName: obj?.name ?? '',
      region: '', // the state list changes with the country
    })
  }

  function detect() {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError('Geolocation is not supported on this device — pick your country below.')
      return
    }
    setStatus('asking')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const d = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
          if (!d.country_name) throw new Error("Couldn't work out your country from that location.")
          const code = d.country_code ?? ''
          // The geocoder's wording rarely matches our state list exactly, so
          // try every candidate it gave us and keep the first that reconciles.
          // An unmatched state stays blank for the user to pick rather than
          // being silently set to the wrong one.
          let region = ''
          for (const candidate of d.regionCandidates) {
            region = matchRegion(code, candidate)
            if (region) break
          }

          set({
            countryCode: code,
            countryName: d.country_name,
            region,
            city: d.city ?? '',
          })
          setStatus('idle')

          const missing = [!region && 'state', !d.city && 'city'].filter(Boolean)
          setError(
            missing.length
              ? `Found ${d.country_name}${d.city ? ` and ${d.city}` : ''} — add your ${missing.join(' and ')} below.`
              : null,
          )
        } catch (e) {
          setStatus('error')
          setError((e as Error).message || 'Could not look that up — pick your country below.')
        }
      },
      (err) => {
        setStatus('error')
        setError(geolocationErrorMessage(err))
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={detect}
        disabled={status === 'asking'}
        className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-60"
      >
        <span className="w-9 h-9 rounded-full bg-gradient-brand grid place-items-center text-base glow-rose shrink-0">📍</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {status === 'asking' ? 'Finding you…' : 'Use my location'}
          </span>
          <span className="block text-xs text-ink-muted">Fills the fields below. Optional.</span>
        </span>
      </button>

      {error && <p className="text-xs text-ink-muted px-1">{error}</p>}

      <Field label="Country">
        <select
          value={data.countryCode}
          onChange={(e) => pickCountry(e.target.value)}
          className="lm-input w-full"
        >
          <option value="">Select country…</option>
          {sortedCountries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Field>

      <Field label="State / region">
        {states ? (
          <select
            value={data.region}
            onChange={(e) => set({ region: e.target.value })}
            className="lm-input w-full"
            disabled={!data.countryCode}
          >
            <option value="">Select state…</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input
            value={data.region}
            onChange={(e) => set({ region: e.target.value })}
            placeholder="e.g. Bavaria"
            className="lm-input w-full"
            disabled={!data.countryCode}
            maxLength={60}
          />
        )}
      </Field>

      <Field label="City">
        <input
          value={data.city}
          onChange={(e) => set({ city: e.target.value })}
          placeholder="e.g. Lagos"
          className="lm-input w-full"
          disabled={!data.countryCode}
          maxLength={60}
        />
      </Field>

      <Field label="Language">
        <select
          value={data.language}
          onChange={(e) => set({ language: e.target.value })}
          className="lm-input w-full"
        >
          <option value="">Select language…</option>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </Field>

      <p className="text-[11px] text-ink-muted px-1">
        You can change any of this later in your profile.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-ink-muted mb-1 px-1">{label}</span>
      {children}
    </label>
  )
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case 1: return 'Location permission was denied — no problem, pick your country below.'
    case 2: return 'Could not get your position right now — pick your country below.'
    case 3: return 'Location lookup timed out — pick your country below.'
    default: return err.message || 'Could not get your location — pick your country below.'
  }
}

async function reverseGeocode(lat: number, lon: number) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18` +
    `&lat=${lat}&lon=${lon}&accept-language=en`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`)
  const data = await res.json()
  const a = (data.address ?? {}) as Record<string, string | undefined>

  // Leave a breadcrumb: when detection disappoints, the first question is
  // always "what did it actually return?"
  console.debug('[location] reverse geocode address', a)

  // Only accept a clean ISO 3166-1 alpha-2 code so the country select can
  // actually key on what we store.
  const cc = a.country_code?.toUpperCase() ?? null

  // Which key holds the state varies by country and by how much OSM detail
  // exists at the point — and sometimes none of them do, while the state is
  // still sitting there in display_name. So collect every candidate and let
  // matchRegion try them in order rather than betting on one field.
  const displayParts = String(data.display_name ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const regionCandidates = [
    a.state,
    a.region,
    a.province,
    a.state_district,
    a.county,
    ...displayParts,
  ].filter((s): s is string => !!s)

  return {
    country_code: cc && /^[A-Z]{2}$/.test(cc) ? cc : null,
    country_name: a.country ?? null,
    regionCandidates,
    city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? null,
  }
}
