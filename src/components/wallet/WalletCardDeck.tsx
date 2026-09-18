import { useRef, useState } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'framer-motion'
import { useUserCurrency } from '../../hooks/useAmount'

type Props = {
  uuid: string
  referralCode: string
  balanceUsdt: number
}

/**
 * The CSS-3D wallet card for the profile-menu page: balance, UUID (copy),
 * referral (copy), show/hide.
 *
 * It was a two-card swipeable deck; the Earnings card went in Phase 0 along
 * with the earnings summary it read from. Phase 3 replaces the balance here
 * with the credit balance.
 *
 * The card lives in a perspective container and tilts toward the pointer
 * (desktop) for a real-depth feel; a glare sweep + layered shadow sell the
 * 3D without any WebGL. All text stays as real, selectable, copyable DOM.
 */
export default function WalletCardDeck({
  uuid, referralCode, balanceUsdt,
}: Props) {
  const [hidden, setHidden] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  function flashCopied(label: string) {
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1400)
  }

  async function copy(text: string, label: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      flashCopied(`${label} copied`)
    } catch {
      flashCopied('Could not copy')
    }
  }

  return (
    <div className="select-none">
      <div className="overflow-hidden" style={{ perspective: 1400 }}>
        <motion.div className="flex">
          <CardShell>
            <WalletFace
              uuid={uuid}
              referralCode={referralCode}
              balanceUsdt={balanceUsdt}
              hidden={hidden}
              onToggleHidden={() => setHidden((h) => !h)}
              onCopy={copy}
            />
          </CardShell>
        </motion.div>
      </div>

      {/* Copy toast */}
      {copied && (
        <div className="mt-2 text-center text-xs text-success font-semibold">{copied}</div>
      )}
    </div>
  )
}

// ---------- 3D shell with pointer-tilt + glare ----------

function CardShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 })
  const glareX = useMotionValue(50)
  const glareY = useMotionValue(0)
  // Live radial-gradient that tracks the pointer for the glare highlight.
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.5), transparent 45%)`

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    ry.set((px - 0.5) * 14)
    rx.set((0.5 - py) * 14)
    glareX.set(px * 100)
    glareY.set(py * 100)
  }
  function onLeave() {
    rx.set(0)
    ry.set(0)
  }

  return (
    <div className="w-full shrink-0 mr-3 last:mr-0">
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="relative"
      >
        <div
          className="relative overflow-hidden rounded-3xl p-5 text-white"
          style={{
            background:
              'linear-gradient(135deg, var(--color-magenta) 0%, var(--color-rose) 50%, var(--color-coral) 100%)',
            boxShadow:
              '0 18px 40px -12px rgba(155,77,255,0.55), 0 8px 18px -8px rgba(255,61,142,0.5)',
            minHeight: '210px',
            transform: 'translateZ(0)',
          }}
        >
          {/* Glare sweep that follows the pointer */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: glare, mixBlendMode: 'soft-light' }}
          />
          {/* Ambient orb for depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full opacity-30"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
          />
          <div style={{ transform: 'translateZ(40px)' }}>{children}</div>
        </div>
      </motion.div>
    </div>
  )
}

// ---------- Wallet face ----------

function WalletFace({
  uuid, referralCode, balanceUsdt, hidden, onToggleHidden, onCopy,
}: {
  uuid: string
  referralCode: string
  balanceUsdt: number
  hidden: boolean
  onToggleHidden: () => void
  onCopy: (text: string, label: string) => void
}) {
  const cur = useUserCurrency()
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold tracking-[0.25em] uppercase opacity-90">
          Love Meet
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 min-w-[2.5rem] text-center">
          {cur.pending ? '…' : cur.code}
        </span>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.2em] opacity-80 font-bold">
          Balance
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {cur.pending ? (
            <span className="inline-block h-8 w-40 rounded-lg bg-white/25 animate-pulse" />
          ) : (
            <span className="text-3xl font-extrabold tabular-nums drop-shadow">
              {hidden ? '******' : cur.format(balanceUsdt)}
            </span>
          )}
          <button
            onClick={onToggleHidden}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
            className="text-base opacity-90 hover:opacity-100"
          >
            {hidden ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div className="mt-auto pt-5 space-y-1.5">
        <CopyRow label="UUID" value={shorten(uuid)} onCopy={() => onCopy(uuid, 'UUID')} />
        <CopyRow label="Referral" value={referralCode} onCopy={() => onCopy(referralCode, 'Referral code')} />
      </div>
    </div>
  )
}

// ---------- bits ----------

function CopyRow({
  label, value, onCopy,
}: { label: string; value: string; onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      className="w-full flex items-center justify-between gap-3 group"
    >
      <span className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-bold shrink-0">
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-sm opacity-95">
        <span className="truncate">{value}</span>
        <span className="opacity-70 group-hover:opacity-100 group-active:opacity-100">⧉</span>
      </span>
    </button>
  )
}

function shorten(id: string): string {
  if (id.length <= 13) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}
