import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'
import { GIFT_CATALOGUE, type CatalogueGift } from '../lib/gifts'
import { useSendGift } from '../hooks/useSendGift'

type Props = {
  postId: string
  recipientId: string
  recipientLabel: string
  onClose: () => void
}

type Phase = 'pick' | 'confirm' | 'sent'

export default function GiftSheet({ postId, recipientId, recipientLabel, onClose }: Props) {
  useDrawerLock()
  const send = useSendGift()
  const [phase, setPhase] = useState<Phase>('pick')
  const [selected, setSelected] = useState<CatalogueGift | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pickGift(g: CatalogueGift) {
    setSelected(g)
    setPhase('confirm')
  }

  async function confirm() {
    if (!selected) return
    setError(null)
    try {
      await send.mutateAsync({ postId, recipientId, gift: selected })
      setPhase('sent')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer.Root
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      snapPoints={[0.6, 0.95]}
      modal
    >
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
                  <span className="text-xs text-ink-muted">to @{recipientLabel}</span>
                </header>
                <div className="flex-1 overflow-y-auto px-3 pb-5 grid grid-cols-3 sm:grid-cols-4 gap-3 content-start">
                  {GIFT_CATALOGUE.map((g) => (
                    <button
                      key={g.giftId}
                      onClick={() => pickGift(g)}
                      className="rounded-2xl p-2 bg-surface/40 hover:bg-surface/70 transition-colors text-center"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden bg-black">
                        <img src={g.image} alt={g.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="text-[11px] font-semibold text-ink mt-1.5 truncate">
                        {g.name}
                      </div>
                      <div className="text-[11px] font-bold text-gradient-warm mt-0.5">
                        ${g.price}
                      </div>
                    </button>
                  ))}
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
                  <img src={selected.image} alt="" className="w-full h-full object-cover" />
                </div>
                <h2 className="mt-4 text-xl font-extrabold text-ink">{selected.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Send <span className="text-gradient-warm font-bold">${selected.price}</span> to{' '}
                  <span className="text-ink font-semibold">@{recipientLabel}</span>?
                </p>
                {error && <p className="mt-3 text-sm text-danger">{error}</p>}

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
                    disabled={send.isPending}
                    className="flex-1 rounded-full py-3 text-sm font-semibold bg-gradient-brand text-white glow-rose disabled:opacity-60"
                  >
                    {send.isPending ? 'Sending…' : 'Send gift'}
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-ink-muted">
                  Balance debit will activate when wallet ships. For now the recipient just sees a
                  pending gift.
                </p>
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
                <div className="text-6xl">🎁</div>
                <h2 className="mt-3 text-2xl font-extrabold text-gradient-warm">Gift sent!</h2>
                <p className="mt-2 text-sm text-ink-2">
                  You sent <span className="font-bold text-ink">{selected.name}</span> to{' '}
                  <span className="font-bold text-ink">@{recipientLabel}</span>.
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
