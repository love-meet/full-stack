import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { StepProps } from '../types'
import { COUNTRIES, STATES } from '../../../data/geo'

type Status = 'idle' | 'asking' | 'error'

export default function LocationStep({ data, set }: StepProps) {
  const { t } = useTranslation()
  // Detected = we have coords AND a country name from the GPS lookup.
  // Entered manually = no coords, but a country has been chosen.
  const detected = data.lat !== null && data.lon !== null && data.countryName.length > 0
  const manual = !detected && data.countryName.length > 0
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  // Watchdog for getCurrentPosition never calling EITHER callback. The
  // `timeout` option below only starts counting once the permission prompt
  // has been answered, so a dismissed or suppressed prompt (common in
  // in-app browsers, e.g. Telegram's Mini-App WebView) leaves this step
  // pinned on "Detecting…" forever — no error, so no manual fallback, and
  // Continue never enables. This guarantees we always reach a state the
  // user can act on.
  const watchdog = useRef<number | null>(null)
  function clearWatchdog() {
    if (watchdog.current !== null) {
      window.clearTimeout(watchdog.current)
      watchdog.current = null
    }
  }
  useEffect(() => clearWatchdog, [])

  function detect() {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError(t('onboarding.stepFields.location.geoNotSupported'))
      return
    }
    setStatus('asking')
    setError(null)
    clearWatchdog()
    watchdog.current = window.setTimeout(() => {
      setStatus('error')
      setError(t('onboarding.stepFields.location.timeout'))
    }, 15000)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearWatchdog()
        try {
          const { latitude, longitude } = pos.coords
          const detail = await reverseGeocode(latitude, longitude)
          if (!detail.country_name) {
            throw new Error(t('onboarding.stepFields.location.couldNotDetermineCountry'))
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
          setError((e as Error).message || t('onboarding.stepFields.location.couldNotLookup'))
        }
      },
      (err) => {
        clearWatchdog()
        setStatus('error')
        setError(geolocationErrorMessage(err, t))
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
                  {status === 'asking' ? t('onboarding.stepFields.location.detecting') : t('onboarding.stepFields.location.addLocation')}
                </span>
                <span className="block text-xs text-ink-muted">
                  {t('onboarding.stepFields.location.powersMatches')}
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
                  {t('onboarding.stepFields.location.continueManually')}
                </button>
              </div>
            )}
            {/* Always offered — never make GPS the only way through this
                step. Users who decline location, or whose browser blocks it
                outright, still need a path forward. */}
            {status !== 'error' && (
              <button
                onClick={() => { clearWatchdog(); setStatus('idle'); setManualOpen(true) }}
                className="w-full text-center text-xs text-ink-muted hover:text-rose transition-colors py-1"
              >
                {t('onboarding.stepFields.location.enterManuallyLink')}
              </button>
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
            {data.address && <DisplayField label={t('onboarding.stepFields.location.cityLabel')} value={data.address} />}
            {data.region && <DisplayField label={t('onboarding.stepFields.location.regionLabel')} value={data.region} />}
            <DisplayField label={t('onboarding.stepFields.location.countryLabel')} value={data.countryName} />
            <button
              onClick={detect}
              disabled={status === 'asking'}
              className="text-xs text-ink-muted hover:text-rose transition-colors pl-1"
            >
              {status === 'asking' ? t('onboarding.stepFields.location.detectingShort') : t('onboarding.stepFields.location.redetect')}
            </button>
            {status === 'error' && error && (
              <p className="text-xs text-danger px-1">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-ink-muted px-1">
        {t('onboarding.stepFields.location.usageNote')}
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
  const { t } = useTranslation()
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
      <p className="text-xs text-ink-muted px-1">{t('onboarding.stepFields.location.enterManually')}</p>

      <Field label={t('onboarding.stepFields.location.countryLabel')}>
        <select
          value={country}
          onChange={(e) => pickCountry(e.target.value)}
          className="lm-input w-full"
        >
          <option value="">{t('onboarding.stepFields.location.selectCountry')}</option>
          {sortedCountries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Field>

      <Field label={t('onboarding.stepFields.location.stateRegionLabel')}>
        {states ? (
          <select
            value={data.region}
            onChange={(e) => set({ region: e.target.value })}
            className="lm-input w-full"
            disabled={!country}
          >
            <option value="">{t('onboarding.stepFields.location.selectState')}</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input
            value={data.region}
            onChange={(e) => set({ region: e.target.value })}
            placeholder={t('onboarding.stepFields.location.regionPlaceholder')}
            className="lm-input w-full"
            disabled={!country}
            maxLength={60}
          />
        )}
      </Field>

      <Field label={t('onboarding.stepFields.location.cityLabel')}>
        <input
          value={data.address}
          onChange={(e) => set({ address: e.target.value })}
          placeholder={t('onboarding.stepFields.location.cityPlaceholder')}
          className="lm-input w-full"
          disabled={!country}
          maxLength={60}
        />
      </Field>

      <button
        onClick={onCancel}
        className="text-xs text-ink-muted hover:text-rose transition-colors pl-1"
      >
        {t('onboarding.stepFields.location.tryDetectionInstead')}
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

function geolocationErrorMessage(err: GeolocationPositionError, t: TFunction): string {
  switch (err.code) {
    case 1: return t('onboarding.stepFields.location.permissionDenied')
    case 2: return t('onboarding.stepFields.location.positionUnavailable')
    case 3: return t('onboarding.stepFields.location.timeout')
    default: return err.message || t('onboarding.stepFields.location.unknownError')
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
