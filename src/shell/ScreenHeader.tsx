import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  right?: ReactNode
  /** Pick which gradient the title uses. */
  tone?: 'warm' | 'brand'
}

export default function ScreenHeader({ title, subtitle, right, tone = 'warm' }: Props) {
  return (
    <div className="relative px-5 pt-7 pb-5 sm:px-8 sm:pt-10">
      {/* Ambient color blob behind the title — soft, never distracting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -left-8 w-72 h-72 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            tone === 'warm'
              ? 'radial-gradient(circle, var(--color-gold) 0%, var(--color-magenta) 60%, transparent 80%)'
              : 'radial-gradient(circle, var(--color-rose) 0%, var(--color-magenta) 60%, transparent 80%)',
        }}
      />
      <div className="relative flex items-end justify-between gap-3">
        <div>
          <motion.h1
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
              tone === 'warm' ? 'text-gradient-warm' : 'text-gradient-brand'
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p
              className="mt-1 text-sm text-ink-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  )
}
