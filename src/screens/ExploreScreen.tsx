import { useMemo, useRef, useState } from 'react'
import { motion, useMotionTemplate, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ScreenHeader from '../shell/ScreenHeader'
import TopIcons from '../shell/TopIcons'
import { stagger, itemUp } from '../shell/motion'
import { useGroups, type Group } from '../hooks/useGroups'
import { useProfile } from '../hooks/useProfile'
import AgeGateModal from '../components/AgeGateModal'

const KIND_GLYPH: Record<string, string> = {
  pickup_lines: '✨',
  naughty: '🌶',
  advice: '💡',
  custom: '👥',
}

const KIND_GRADIENT: Record<string, string> = {
  pickup_lines: 'linear-gradient(135deg, var(--color-rose) 0%, var(--color-magenta) 100%)',
  naughty:      'linear-gradient(135deg, var(--color-rose) 0%, var(--color-coral) 100%)',
  advice:       'linear-gradient(135deg, var(--color-gold) 0%, var(--color-coral) 100%)',
  custom:       'linear-gradient(135deg, var(--color-magenta) 0%, var(--color-coral) 100%)',
}

export default function ExploreScreen() {
  const { t } = useTranslation()
  const KIND_LABEL: Record<string, string> = {
    pickup_lines: t('explore.pickupLines'),
    naughty: t('explore.naughty'),
    advice: t('explore.advice'),
    custom: t('explore.community'),
  }
  const groups = useGroups()
  const profile = useProfile()
  const navigate = useNavigate()
  const [pendingNaughtySlug, setPendingNaughtySlug] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string | null>(null) // null = All

  const isAgeConfirmed = !!profile.data?.age_18_confirmed
  const list = groups.data ?? []

  // Which kind-filter chips to show — only kinds that actually exist.
  const kinds = useMemo(() => {
    const seen = new Set<string>()
    for (const g of list) seen.add(g.kind)
    return [...seen]
  }, [list])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return list.filter((g) => {
      if (kind && g.kind !== kind) return false
      if (!term) return true
      return (
        g.name.toLowerCase().includes(term) ||
        (g.description ?? '').toLowerCase().includes(term)
      )
    })
  }, [list, q, kind])

  function open(g: Group) {
    if (g.requires_age_gate && !isAgeConfirmed) {
      setPendingNaughtySlug(g.slug)
      return
    }
    navigate(`/g/${g.slug}`)
  }

  const ready = groups.status === 'success'
  const noMatches = ready && list.length > 0 && filtered.length === 0

  return (
    <div className="min-h-full relative">
      <ScreenHeader title={t('explore.title')} right={<TopIcons />} />

      {/* Search + category filters */}
      <div className="px-5 sm:px-8 pt-5 space-y-3">
        <div className="glass rounded-full px-4 py-2.5 flex items-center gap-2 focus-within:ring-brand transition-shadow">
          <span className="text-ink-muted">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('explore.searchPlaceholder')}
            className="flex-1 bg-transparent outline-none placeholder:text-ink-muted text-sm"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label={t('explore.clearSearch')}
              className="text-ink-muted hover:text-ink text-base px-1"
            >
              ✕
            </button>
          )}
        </div>

        {kinds.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            <Chip active={kind === null} onClick={() => setKind(null)}>{t('explore.all')}</Chip>
            {kinds.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                <span className="mr-1">{KIND_GLYPH[k] ?? KIND_GLYPH.custom}</span>
                {KIND_LABEL[k] ?? t('explore.community')}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 sm:px-8 pt-4 pb-28">
        {groups.status === 'pending' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-3xl h-44 animate-pulse" />
            ))}
          </div>
        )}

        {groups.status === 'error' && (
          <div className="glass rounded-2xl p-5 text-sm text-danger">
            {t('explore.loadError', { message: (groups.error as Error).message })}
          </div>
        )}

        {noMatches && (
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-ink font-semibold mb-1">{t('explore.noGroupsTitle')}</p>
            <p className="text-sm text-ink-muted">
              {t('explore.noGroupsSubtitle', { query: q.trim() })}
            </p>
          </div>
        )}

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 gap-4"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {filtered.map((g) => (
            <motion.div key={g.id} variants={itemUp}>
              <GroupCard
                group={g}
                locked={g.requires_age_gate && !isAgeConfirmed}
                onOpen={() => open(g)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {pendingNaughtySlug && (
          <AgeGateModal
            onConfirm={() => {
              const slug = pendingNaughtySlug
              setPendingNaughtySlug(null)
              if (slug) navigate(`/g/${slug}`)
            }}
            onDecline={() => setPendingNaughtySlug(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap',
        active ? 'bg-gradient-brand text-white glow-rose' : 'glass text-ink-2 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ---------- 3D group card ----------

function GroupCard({
  group, locked, onOpen,
}: { group: Group; locked: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement | null>(null)
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  const gx = useMotionValue(50)
  const gy = useMotionValue(0)
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.45), transparent 45%)`

  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    ry.set((px - 0.5) * 12)
    rx.set((0.5 - py) * 12)
    gx.set(px * 100)
    gy.set(py * 100)
  }
  function onLeave() { rx.set(0); ry.set(0) }

  const glyph = KIND_GLYPH[group.kind] ?? KIND_GLYPH.custom
  const gradient = KIND_GRADIENT[group.kind] ?? KIND_GRADIENT.custom
  // The owner's uploaded photo — cover preferred, else the avatar.
  const image = group.cover_url || group.avatar_url

  return (
    <button
      ref={ref}
      onClick={onOpen}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="w-full text-left"
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="relative overflow-hidden rounded-3xl p-4 text-white min-h-[176px] flex flex-col"
      >
        {/* Background: the group's photo when it has one, otherwise the
            kind-themed gradient. A dark scrim keeps the text legible. */}
        {image ? (
          <>
            <img
              src={image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: gradient }} />
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: glare, mixBlendMode: 'soft-light' }}
            />
            <div
              aria-hidden
              className="absolute -top-12 -right-8 w-40 h-40 rounded-full opacity-25 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
            />
          </>
        )}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
        />

        <div className="relative flex items-start justify-between" style={{ transform: 'translateZ(30px)' }}>
          <span className={image ? 'text-2xl drop-shadow' : 'text-4xl drop-shadow'}>{glyph}</span>
          <div className="flex items-center gap-1.5">
            {locked && <span className="text-lg opacity-90">🔒</span>}
            {group.is_default && !locked && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                {t('explore.official')}
              </span>
            )}
          </div>
        </div>

        <div className="relative mt-auto" style={{ transform: 'translateZ(20px)' }}>
          <div className="text-lg font-extrabold drop-shadow leading-tight line-clamp-2">{group.name}</div>
          {group.description && (
            <div className="text-xs text-white/85 line-clamp-1 mt-0.5">{group.description}</div>
          )}
          <div className="mt-2 text-[11px] font-semibold text-white/80">
            {group.post_count} {group.post_count === 1 ? t('explore.post') : t('explore.posts')}
            {group.member_count > 0 && <> · {group.member_count} {t('explore.members')}</>}
          </div>
        </div>
      </motion.div>
    </button>
  )
}
