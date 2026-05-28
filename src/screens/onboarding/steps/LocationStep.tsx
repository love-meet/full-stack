import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StepProps } from '../types'
import { COUNTRIES, STATES } from '../../../data/geo'

type Status = 'idle' | 'asking' | 'error'

export default function LocationStep({ data, set }: StepProps) {
  // Detected = we have coords AND a country name from the GPS lookup.
  // Entered manually = no coords, but a country has been chosen.
  const detected = data.lat !== null && data.lon !== null && data.countryName.length > 0
  const manual = !detected && data.countryName.length > 0
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  function detect() {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError('Geolocation is not supported on this device.')
      return
    }
    setStatus('asking')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const detail = await reverseGeocode(latitude, longitude)
          if (!detail.country_name) {
            throw new Error("Couldn't determine your country from that location.")
          }
          set({
            lat: latitude,
            lon: longitude,
            address: detail.city ?? '',
            region: detail.region ?? '',
            countryCode: detail.country_code ?? '',
            countryName: detail.country_name,
          })
          setStatus('idle')
        } catch (e) {
          setStatus('error')
          setError((e as Error).message || 'Could not look up that location.')
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
      <AnimatePresence mode="wait" initial={false}>
        {!detected && !manualOpen && !manual ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <button
              onClick={detect}
              disabled={status === 'asking'}
              className="w-full glass rounded-2xl px-4 py-4 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-60"
            >
              <span className="w-10 h-10 rounded-full bg-gradient-brand grid place-items-center text-lg glow-rose shrink-0">📍</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-ink">
                  {status === 'asking' ? 'Detecting your location…' : 'Add location'}
                </span>
                <span className="block text-xs text-ink-muted">
                  Powers distance &amp; nearby matches.
                </span>
              </span>
            </button>
            {status === 'error' && error && (
              <div className="space-y-2">
                <p className="text-xs text-danger px-1">{error}</p>
                <button
                  onClick={() => setManualOpen(true)}
                  className="w-full rounded-full py-2.5 text-sm font-bold bg-gradient-brand text-white glow-rose"
                >
                  Continue manually
                </button>
              </div>
            )}
          </motion.div>
        ) : manualOpen || manual ? (
          <ManualForm
            data={data}
            set={set}
            onCancel={() => {
              setManualOpen(false)
              set({ countryCode: '', countryName: '', region: '', address: '', lat: null, lon: null })
            }}
          />
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="space-y-2"
          >
            {data.address && <DisplayField label="City" value={data.address} />}
            {data.region && <DisplayField label="Region" value={data.region} />}
            <DisplayField label="Country" value={data.countryName} />
            <button
              onClick={detect}
              disabled={status === 'asking'}
              className="text-xs text-ink-muted hover:text-rose transition-colors pl-1"
            >
              {status === 'asking' ? 'Detecting…' : '↻ Re-detect'}
            </button>
            {status === 'error' && error && (
              <p className="text-xs text-danger px-1">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-ink-muted px-1">
        We use your location to show you relevant people. You can update this anytime in your profile.
      </p>
    </div>
  )
}

/** Manual location entry — country & state are dropdowns (states only for the
 *  countries we have data for; others fall back to a free-text region field),
 *  city is a text input. Values write to the form on every change so the step
 *  is "complete" as soon as a country is picked. */
function ManualForm({
  data, set, onCancel,
}: { data: StepProps['data']; set: StepProps['set']; onCancel: () => void }) {
  const country = data.countryCode
  const states = STATES[country]
  // Sort once per render with locale-aware comparison so accented names land
  // in the right place (e.g. Åland near A, Réunion near R).
  const sortedCountries = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

  function pickCountry(code: string) {
    const obj = COUNTRIES.find((c) => c.code === code)
    set({
      countryCode: code,
      countryName: obj?.name ?? '',
      region: '', // reset when country changes
      lat: null,
      lon: null,
    })
  }

  return (
    <motion.div
      key="manual"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      <p className="text-xs text-ink-muted px-1">Enter your location manually.</p>

      <Field label="Country">
        <select
          value={country}
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
            disabled={!country}
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
            disabled={!country}
            maxLength={60}
          />
        )}
      </Field>

      <Field label="City">
        <input
          value={data.address}
          onChange={(e) => set({ address: e.target.value })}
          placeholder="e.g. Lagos"
          className="lm-input w-full"
          disabled={!country}
          maxLength={60}
        />
      </Field>

      <button
        onClick={onCancel}
        className="text-xs text-ink-muted hover:text-rose transition-colors pl-1"
      >
        ↻ Try detection instead
      </button>
    </motion.div>
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

function DisplayField({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-2.5 flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted w-16 shrink-0">
        {label}
      </span>
      <span className="flex-1 text-sm text-ink truncate">{value}</span>
    </div>
  )
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case 1: return 'Location permission was denied. Enable it in your browser settings and try again.'
    case 2: return 'Could not get your position right now. Try again in a moment.'
    case 3: return 'Location lookup timed out. Try again.'
    default: return err.message || 'Unknown geolocation error.'
  }
}

async function reverseGeocode(lat: number, lon: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`)
  const data = await res.json()
  const a = data.address ?? {}
  // Nominatim returns an ISO 3166-1 alpha-2 code (e.g. "gh"). Uppercase it
  // and only accept a clean 2-letter code so we never store anything our
  // currency map can't key on (it expects "GH", not "GHA"/"GHS").
  const cc = (a.country_code as string | undefined)?.toUpperCase() ?? null
  return {
    country_code: cc && /^[A-Z]{2}$/.test(cc) ? cc : null,
    country_name: (a.country as string | undefined) ?? null,
    region: (a.state ?? a.region ?? null) as string | null,
    city: (a.city ?? a.town ?? a.village ?? a.suburb ?? null) as string | null,
  }
}
