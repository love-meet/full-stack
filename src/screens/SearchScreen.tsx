import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import ScreenHeader from '../shell/ScreenHeader'
import { stagger, itemUp } from '../shell/motion'
import {
  useSearchProfiles,
  type SearchableProfile,
  type SearchFilters,
} from '../hooks/useSearchProfiles'
import { useIsOnline } from '../stores/presence'
import { avatarUrlOr } from '../lib/avatar'
import type { Profile } from '../hooks/useProfile'

const GENDER_OPTIONS: NonNullable<Profile['gender']>[] = [
  'female', 'male', 'nonbinary', 'other', 'prefer_not_to_say',
]
const LOOKING_OPTIONS: NonNullable<Profile['looking_for']>[] = [
  'serious', 'casual', 'friends',
]
const AGE_PRESETS: { label: string; min: number; max: number }[] = [
  { label: '18–24', min: 18, max: 24 },
  { label: '25–34', min: 25, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45+',   min: 45, max: 99 },
]

export default function SearchScreen() {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [onlineOnly, setOnlineOnly] = useState(false)

  // Debounce free-text by 250ms so we don't fire on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])

  const queryFilters = useMemo<SearchFilters>(
    () => ({ ...filters, q: debounced }),
    [filters, debounced],
  )

  const results = useSearchProfiles(queryFilters)
  const allRows = results.data?.pages.flat() ?? []

  // Online-only is filtered client-side from the presence store. Doing it
  // server-side would mean writing presence to a DB table.
  const rows = onlineOnly ? <FilterByOnline rows={allRows} /> : allRows

  function setFilter<K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) {
    setFilters((f) => {
      const next = { ...f }
      if (v == null || v === '') delete next[k]
      else (next as Record<string, unknown>)[k] = v
      return next
    })
  }

  function clearAll() {
    setText('')
    setDebounced('')
    setFilters({})
    setOnlineOnly(false)
  }

  const activeCount =
    Object.keys(filters).length + (onlineOnly ? 1 : 0) + (debounced ? 1 : 0)

  return (
    <div className="min-h-full">
      <ScreenHeader
        title="Search"
        subtitle="Find people. Filter the noise."
      />

      <div className="px-5 sm:px-8 space-y-4">
        {/* Free-text */}
        <div className="glass rounded-full px-5 py-3 flex items-center gap-3 focus-within:ring-brand transition-shadow">
          <span className="text-ink-muted text-lg">⌕</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by handle, name, or bio"
            className="flex-1 bg-transparent outline-none placeholder:text-ink-muted"
          />
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[11px] uppercase tracking-wider text-ink-muted hover:text-rose font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick toggles */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <Chip
            active={onlineOnly}
            onClick={() => setOnlineOnly((v) => !v)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block mr-1.5" />
            Online now
          </Chip>
          {AGE_PRESETS.map((p) => {
            const active = filters.minAge === p.min && filters.maxAge === p.max
            return (
              <Chip
                key={p.label}
                active={active}
                onClick={() => {
                  if (active) {
                    setFilter('minAge', undefined)
                    setFilter('maxAge', undefined)
                  } else {
                    setFilter('minAge', p.min)
                    setFilter('maxAge', p.max)
                  }
                }}
              >
                {p.label}
              </Chip>
            )
          })}
        </div>

        {/* Gender + looking-for sections */}
        <div className="flex flex-col gap-2">
          <FilterRow label="Gender">
            {GENDER_OPTIONS.map((g) => (
              <Chip
                key={g}
                active={filters.gender === g}
                onClick={() => setFilter('gender', filters.gender === g ? undefined : g)}
              >
                {labelGender(g)}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Looking for">
            {LOOKING_OPTIONS.map((l) => (
              <Chip
                key={l}
                active={filters.lookingFor === l}
                onClick={() => setFilter('lookingFor', filters.lookingFor === l ? undefined : l)}
              >
                {l}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Country">
            <input
              type="text"
              value={filters.country ?? ''}
              onChange={(e) => setFilter('country', e.target.value || undefined)}
              placeholder="e.g. Nigeria"
              className="lm-input max-w-[16rem]"
            />
          </FilterRow>
        </div>
      </div>

      {/* Results */}
      {results.status === 'pending' && (
        <div className="px-5 sm:px-8 pt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl aspect-[3/4] animate-pulse" />
          ))}
        </div>
      )}

      {results.status === 'success' && (Array.isArray(rows) ? rows : []).length === 0 && (
        <div className="px-5 sm:px-8 pt-8">
          <div className="glass rounded-3xl p-8 text-center text-ink-muted">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-sm">
              {activeCount === 0
                ? 'Use the filters above to find people.'
                : 'Nothing matched. Try widening your filters.'}
            </p>
          </div>
        </div>
      )}

      {Array.isArray(rows) ? (
        <ResultsGrid rows={rows} />
      ) : (
        rows /* the <FilterByOnline> component renders the grid itself */
      )}

      {results.hasNextPage && (
        <div className="px-5 sm:px-8 pb-10">
          <button
            onClick={() => results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
            className="w-full glass rounded-full py-3 text-sm text-ink-2 hover:text-ink font-semibold"
          >
            {results.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- pieces ----------

function FilterRow({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
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
        'shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
        active
          ? 'bg-gradient-brand text-white glow-rose'
          : 'glass text-ink-2 hover:text-rose',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ResultsGrid({ rows }: { rows: SearchableProfile[] }) {
  return (
    <motion.div
      className="px-5 sm:px-8 pt-5 pb-10 grid grid-cols-2 sm:grid-cols-3 gap-3"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {rows.map((p) => (
        <motion.div key={p.id} variants={itemUp}>
          <ResultCard p={p} />
        </motion.div>
      ))}
    </motion.div>
  )
}

function ResultCard({ p }: { p: SearchableProfile }) {
  const online = useIsOnline(p.id)
  return (
    <Link
      to={`/profile/${p.id}`}
      className="block glass rounded-2xl p-3 text-left hover:bg-white/[0.04] transition-colors"
    >
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-surface-3">
        <img
          src={avatarUrlOr(p.avatar_url, p.gender)}
          alt=""
          className="w-full h-full object-cover"
        />
        {online && (
          <span
            className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-success ring-2 ring-surface-2"
            aria-label="Online"
          />
        )}
        {p.is_verified && (
          <span
            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-rose grid place-items-center text-white text-[10px] font-bold"
            aria-label="Verified"
          >
            ✓
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-sm font-semibold text-ink truncate">
          @{p.handle ?? p.display_name ?? 'unknown'}
        </span>
        {p.age != null && (
          <span className="text-xs text-ink-muted shrink-0">{p.age}</span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-muted truncate">
        {[p.city, p.country_name].filter(Boolean).join(', ') || (p.looking_for ?? ' ')}
      </div>
    </Link>
  )
}

/**
 * Renders the grid filtered to only users currently in the online set.
 * Lives as a component (not a function on rows) so each result row can
 * call `useIsOnline` itself — the presence Set updates trigger
 * re-renders cleanly through Zustand's selector subscription.
 */
function FilterByOnline({ rows }: { rows: SearchableProfile[] }) {
  return (
    <motion.div
      className="px-5 sm:px-8 pt-5 pb-10 grid grid-cols-2 sm:grid-cols-3 gap-3"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {rows.map((p) => (
        <OnlineGate key={p.id} userId={p.id}>
          <motion.div variants={itemUp}>
            <ResultCard p={p} />
          </motion.div>
        </OnlineGate>
      ))}
    </motion.div>
  )
}

function OnlineGate({
  userId, children,
}: { userId: string; children: React.ReactNode }) {
  const online = useIsOnline(userId)
  if (!online) return null
  return <>{children}</>
}

// ---------- helpers ----------

function labelGender(g: NonNullable<Profile['gender']>): string {
  switch (g) {
    case 'female': return 'Female'
    case 'male': return 'Male'
    case 'nonbinary': return 'Nonbinary'
    case 'other': return 'Other'
    case 'prefer_not_to_say': return 'Rather not say'
  }
}
