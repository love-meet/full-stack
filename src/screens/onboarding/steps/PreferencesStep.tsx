import type { StepProps } from '../types'

export default function PreferencesStep({ data, set }: StepProps) {
  function setMin(n: number) {
    const min = clamp(n, 18, 100)
    set({ ageMin: min, ageMax: Math.max(min, data.ageMax) })
  }
  function setMax(n: number) {
    const max = clamp(n, 18, 100)
    set({ ageMax: max, ageMin: Math.min(max, data.ageMin) })
  }

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <Label>Age range</Label>
          <span className="text-sm font-semibold text-ink">
            {data.ageMin} – {data.ageMax}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Min" value={data.ageMin} onChange={setMin} />
          <NumberField label="Max" value={data.ageMax} onChange={setMax} />
        </div>
      </section>

      <section className="space-y-3">
        <Label>Privacy</Label>
        <ToggleRow
          title="Show online status"
          subtitle="Let others see when you're active."
          value={data.showOnlineStatus}
          onChange={(v) => set({ showOnlineStatus: v })}
        />
        <ToggleRow
          title="Show my distance"
          subtitle="Display how far away you are."
          value={data.showDistance}
          onChange={(v) => set({ showDistance: v })}
        />
      </section>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-ink-muted px-1">
      {children}
    </h3>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted pl-1">
        {label}
      </span>
      <div className="mt-1 glass rounded-2xl px-4 py-3 focus-within:ring-brand transition-shadow">
        <input
          type="number"
          inputMode="numeric"
          min={18}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 18)}
          className="w-full bg-transparent outline-none text-ink text-base"
        />
      </div>
    </label>
  )
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full glass rounded-2xl px-4 py-3.5 flex items-center justify-between text-left hover:text-ink transition-colors"
    >
      <div className="min-w-0">
        <div className="text-ink font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-ink-muted mt-0.5">{subtitle}</div>}
      </div>
      <span
        className={[
          'relative h-7 w-12 rounded-full transition-colors shrink-0',
          value ? 'bg-gradient-brand glow-rose' : 'bg-surface-3',
        ].join(' ')}
        aria-hidden
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}
