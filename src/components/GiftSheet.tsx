import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { useGiftCatalogue, isInsufficientCoins, type CatalogueGift } from '../hooks/useGiftCatalogue'
import { useSendProfileGift } from '../hooks/useProfileActions'
import { useCredits } from '../hooks/useCredits'

/**
 * Send a gift to a person (HS-LM-v1 §06).
 *
 * Gifts are bought with coins now, and are worth fewer coins to the person
 * receiving them. That asymmetry is the whole design: it makes a gift a real
 * gesture that costs something, and it means the coin supply only ever
 * shrinks when one is sent, so nobody can farm them in a circle.
 *
 * The prices shown here are read from the server's catalogue and are for
 * display only — send_profile_gift looks the cost up again and ignores
 * anything the client says about it.
 */
type Props = {
  recipientId: string
  recipientLabel: string
  onClose: () => void
}

type Phase = 'pick' | 'confirm' | 'sent'

export default function GiftSheet({ recipientId, recipientLabel, onClose }: Props) {
  useDrawerLock()
  const catalogue = useGiftCatalogue()
  const balance = useCredits()
  const send = useSendProfileGift()

  const [phase, setPhase] = useState<Phase>('pick')
  const [selected, setSelected] = useState<CatalogueGift | null>(null)
  const [error, setError] = useState<string | null>(null)

  const coins = balance.data ?? 0
  const gifts = catalogue.data ?? []

  async function confirm() {
    if (!selected) return
    setError(null)
    try {
      await send.mutateAsync({ profileId: recipientId, giftId: selected.gift_id })
      setPhase('sent')
    } catch (e) {
      setError(
        isInsufficientCoins(e)
          ? `That costs ${selected.cost_coins} coins and you have ${coins}.`
          : (e as Error).message,
      )
    }
  }

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose() }} snapPoints={[0.6, 0.95]} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-xl bg-surface-2 rounded-t-3xl flex flex-col outline-none"
          style={{ height: '95dvh' }}
        >
          <div className="pt-3 pb-2 shrink-0">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>
          <Drawer.Title className="sr-only">Send a gift</Drawer.Title>

          <AnimatePresence mode="wait">
            {phase === 'pick' && (
              <motion.div
                key="pick"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <header className="px-5 pb-3 flex items-baseline justify-between shrink-0">
                  <h2 className="text-lg font-extrabold text-gradient-warm">Send a gift</h2>
                  <span className="text-xs font-bold text-ink-2 tabular-nums">
                    {coins.toLocaleString()} coins
                  </span>
                </header>

                {catalogue.status === 'pending' && (
                  <div className="px-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-white/8 animate-pulse" />
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-3 pb-5 grid grid-cols-3 sm:grid-cols-4 gap-3 content-start">
                  {gifts.map((g) => {
                    const affordable = coins >= g.cost_coins
                    return (
                      <button
                        key={g.gift_id}
                        onClick={() => { setSelected(g); setPhase('confirm'); setError(null) }}
                        className={[
                          'rounded-2xl p-2 text-center transition-colors',
                          affordable ? 'bg-surface/40 hover:bg-surface/70' : 'bg-surface/20 opacity-55',
                        ].join(' ')}
                      >
                        <div className="aspect-square rounded-xl overflow-hidden bg-black">
                          {g.image && <img src={g.image} alt={g.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="text-[11px] font-semibold text-ink mt-1.5 truncate">{g.name}</div>
                        <div className="text-[11px] font-bold text-rose tabular-nums">
                          {g.cost_coins} coins
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {phase === 'confirm' && selected && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col px-6 pb-8 text-center overflow-y-auto"
              >
                <div className="w-32 h-32 rounded-2xl mx-auto overflow-hidden bg-black glow-rose">
                  {selected.image && <img src={selected.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <h2 className="mt-4 text-xl font-extrabold text-ink">{selected.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Send to <span className="text-ink font-semibold">@{recipientLabel}</span>?
                </p>

                <div className="mt-4 glass rounded-2xl p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-2">It costs you</span>
                    <span className="font-extrabold text-ink tabular-nums">{selected.cost_coins} coins</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-ink-2">They receive</span>
                    <span className="font-extrabold text-ink tabular-nums">{selected.value_coins} coins</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/8 flex items-center justify-between text-xs">
                    <span className="text-ink-muted">Your balance after</span>
                    <span className="font-bold text-ink-2 tabular-nums">
                      {Math.max(0, coins - selected.cost_coins).toLocaleString()} coins
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="mt-3 text-sm text-danger">
                    {error}{' '}
                    {isInsufficientCoins(new Error(error)) && (
                      <Link to="/credits" className="underline font-semibold">Get more</Link>
                    )}
                  </p>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => { setPhase('pick'); setSelected(null); setError(null) }}
                    disabled={send.isPending}
                    className="flex-1 rounded-full py-3 text-sm font-semibold glass text-ink-2 hover:text-ink disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    onClick={confirm}
                    disabled={send.isPending || coins < selected.cost_coins}
                    className="flex-1 rounded-full py-3 text-sm font-semibold bg-gradient-brand text-white glow-rose disabled:opacity-60"
                  >
                    {send.isPending ? 'Sending…'
                      : coins < selected.cost_coins ? 'Not enough coins'
                      : `Send for ${selected.cost_coins}`}
                  </button>
                </div>

                {coins < selected.cost_coins && (
                  <Link to="/credits" className="mt-3 text-xs text-rose font-semibold underline">
                    Get more coins
                  </Link>
                )}
              </motion.div>
            )}

            {phase === 'sent' && selected && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="px-6 pb-8 text-center overflow-y-auto"
              >
                <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden bg-black">
                  {selected.image && <img src={selected.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <h2 className="mt-4 text-2xl font-extrabold text-gradient-warm">Gift sent</h2>
                <p className="mt-2 text-sm text-ink-2">
                  <span className="font-bold text-ink">@{recipientLabel}</span> got{' '}
                  <span className="font-bold text-ink">{selected.name}</span> and{' '}
                  {selected.value_coins} coins.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 inline-flex rounded-full px-7 py-3 bg-gradient-brand text-white text-sm font-semibold glow-rose"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
