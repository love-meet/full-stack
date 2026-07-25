import { useEffect, useRef, useState } from 'react'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n/languages'

type Props = {
  value: string
  onChange: (code: LanguageCode) => void
}

/** Custom-styled language dropdown — matches the app's glass/rose-accent look. */
export default function LanguageSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === value) ?? SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(code: LanguageCode) {
    onChange(code)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          'w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 glass border transition-colors',
          open ? 'border-rose' : 'border-white/10',
        ].join(' ')}
      >
        <span className="text-xl leading-none">{current.flag}</span>
        <span className="flex-1 text-left font-semibold text-ink">{current.nativeName}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={['w-4 h-4 text-ink-muted transition-transform shrink-0', open ? 'rotate-180' : ''].join(' ')}
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-2 glass rounded-2xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto no-scrollbar">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === value
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => choose(lang.code)}
                className={[
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  active ? 'bg-rose/15 text-ink' : 'text-ink-2 hover:bg-white/[0.06]',
                ].join(' ')}
              >
                <span className="text-lg leading-none">{lang.flag}</span>
                <span className="flex-1 font-semibold">{lang.nativeName}</span>
                {active && <span className="text-rose text-base leading-none">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
