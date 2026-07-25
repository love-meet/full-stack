import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCreateGame } from '../../hooks/usePixelGame'
import { PopunderAd } from '../../components/FeedAd'

const GRID = 5
const N = GRID * GRID // 25 tiles
const PREVIEW_SECONDS = 5
const DEFAULT_IMAGE = '/hero.jpeg'

type Phase = 'guide' | 'mode' | 'setup' | 'preview' | 'play' | 'won'

export default function PixelRushScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createGame = useCreateGame()
  const [groupCount, setGroupCount] = useState(4)
  const [createErr, setCreateErr] = useState<string | null>(null)

  async function host(kind: '1v1' | 'group', max?: number) {
    setCreateErr(null)
    try {
      const g = await createGame.mutateAsync({ kind, maxPlayers: max })
      navigate(`/play/${g.invite_code}`)
    } catch (e) {
      setCreateErr((e as Error).message)
    }
  }

  // ----- gameplay state -----
  // If the user reached this screen via the Games-list modal (which already
  // showed the rules), skip the in-screen guide and start at mode-select.
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('skip-intro') === '1') {
      return 'mode'
    }
    return 'guide'
  })
  const [image, setImage] = useState<string>(DEFAULT_IMAGE)
  const [order, setOrder] = useState<number[]>(() => identity())
  const [selected, setSelected] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(PREVIEW_SECONDS)
  const [elapsed, setElapsed] = useState(0)
  const [moves, setMoves] = useState(0)
  const startRef = useRef(0)

  // Preview countdown → scatter → play.
  useEffect(() => {
    if (phase !== 'preview') return
    setOrder(identity())
    setCountdown(PREVIEW_SECONDS)
    const iv = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          window.clearInterval(iv)
          setOrder(shuffled())
          setMoves(0)
          startRef.current = Date.now()
          setPhase('play')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(iv)
  }, [phase])

  // Running timer while playing.
  useEffect(() => {
    if (phase !== 'play') return
    const iv = window.setInterval(() => setElapsed(Date.now() - startRef.current), 100)
    return () => window.clearInterval(iv)
  }, [phase])

  function onPickImage(file: File | undefined) {
    if (!file) return
    setImage(URL.createObjectURL(file))
  }

  function tapTile(slot: number) {
    if (phase !== 'play') return
    if (selected === null) { setSelected(slot); return }
    if (selected === slot) { setSelected(null); return }
    setOrder((prev) => {
      const next = [...prev]
      ;[next[selected], next[slot]] = [next[slot], next[selected]]
      if (isSolved(next)) {
        setElapsed(Date.now() - startRef.current)
        setPhase('won')
      }
      return next
    })
    setMoves((m) => m + 1)
    setSelected(null)
  }

  function playAgain() {
    setSelected(null)
    setElapsed(0)
    setPhase('preview')
  }

  // Games gate temporarily open — anyone can host while we drive engagement.
  // Re-enable by checking `useMySubscription().data` against the desired
  // plan tier when paid hosting comes back.

  return (
    <Shell onBack={() => navigate(-1)}>
      <AnimatePresence mode="wait">
        {phase === 'guide' && (
          <Step key="guide">
            <h2 className="text-xl font-extrabold text-gradient-warm">🧩 {t('games.pixelRushTitle')}</h2>
            <p className="text-sm text-ink-2 mt-1">{t('games.pixelRushBlurb')}</p>
            <ol className="mt-4 space-y-2 text-sm text-ink-2 list-decimal pl-5">
              <li>A photo is shown for <b>5 seconds</b> — study it.</li>
              <li>It scatters into a grid — easy <b>3×3</b> early rounds, building up to a hard <b>5×5</b>.</li>
              <li><b>Drag a tile onto another, or tap two tiles, to swap them</b> and rebuild the original.</li>
              <li>Beat the clock — fewest seconds (and moves) wins the round.</li>
              <li>In multiplayer, first to finish takes the round; best of 9 takes the trophy. 🏆</li>
            </ol>
            <button onClick={() => setPhase('mode')} className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose">
              {t('games.prGotIt')}
            </button>
          </Step>
        )}

        {phase === 'mode' && (
          <Step key="mode">
            <h2 className="text-lg font-extrabold text-ink">{t('games.prChooseMode')}</h2>
            <div className="mt-4 space-y-3">
              <button onClick={() => setPhase('setup')} className="w-full glass rounded-2xl p-4 text-left hover:ring-1 hover:ring-gold/40">
                <div className="font-extrabold text-ink">{t('games.prSoloPractice')}</div>
                <div className="text-sm text-ink-muted">{t('games.prSoloPracticeSub')}</div>
              </button>

              <button
                onClick={() => host('1v1')}
                disabled={createGame.isPending}
                className="w-full glass rounded-2xl p-4 text-left hover:ring-1 hover:ring-gold/40 disabled:opacity-60"
              >
                <div className="font-extrabold text-ink">{t('games.prOneVOne')}</div>
                <div className="text-sm text-ink-muted">{t('games.prOneVOneSub')}</div>
              </button>

              <div className="w-full glass rounded-2xl p-4">
                <div className="font-extrabold text-ink">{t('games.prGroupTeams')}</div>
                <div className="text-sm text-ink-muted">{t('games.prGroupTeamsSub')}</div>
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs text-ink-2">{t('games.prPlayersLabel')}</label>
                  <select
                    value={groupCount}
                    onChange={(e) => setGroupCount(Number(e.target.value))}
                    className="lm-input w-20 py-1.5"
                  >
                    {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button
                    onClick={() => host('group', groupCount)}
                    disabled={createGame.isPending}
                    className="ml-auto rounded-full px-4 py-1.5 bg-gradient-brand text-white text-sm font-bold glow-rose disabled:opacity-60"
                  >
                    {t('games.prCreate')}
                  </button>
                </div>
              </div>
            </div>
            {createErr && <p className="mt-3 text-xs text-danger">{createErr}</p>}
            <p className="mt-3 text-[11px] text-ink-muted">
              {t('games.prLobbyNote')}
            </p>
          </Step>
        )}

        {phase === 'setup' && (
          <Step key="setup">
            <h2 className="text-lg font-extrabold text-ink">{t('games.prPickPicture')}</h2>
            <p className="text-sm text-ink-muted mt-1">{t('games.prPickPictureSub')}</p>
            <div className="mt-4 aspect-square w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-black">
              <img src={image} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="mt-4 flex flex-col gap-2 max-w-sm mx-auto">
              <label className="w-full rounded-full py-3 text-center text-sm font-bold glass text-ink-2 hover:text-ink cursor-pointer">
                {t('games.prUploadPhoto')}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
              </label>
              <button onClick={() => setPhase('preview')} className="w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose">
                {t('games.prStartRound')}
              </button>
            </div>
          </Step>
        )}

        {(phase === 'preview' || phase === 'play' || phase === 'won') && (
          <Step key="board">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-ink">
                {phase === 'preview' ? t('games.prStudyPhoto') : `⏱ ${(elapsed / 1000).toFixed(1)}s`}
              </div>
              <div className="text-[11px] text-ink-muted">{phase !== 'preview' && t('games.prMovesCount', { count: moves })}</div>
            </div>

            <div className="relative aspect-square w-full max-w-sm mx-auto select-none">
              <div className="grid grid-cols-5 gap-[3px] w-full h-full">
                {order.map((tile, slot) => {
                  const row = Math.floor(tile / GRID)
                  const col = tile % GRID
                  const showSolved = phase === 'preview' || phase === 'won'
                  return (
                    <motion.button
                      key={tile}
                      layout
                      transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                      onClick={() => tapTile(slot)}
                      className={[
                        'relative rounded-[5px] overflow-hidden',
                        selected === slot ? 'ring-2 ring-gold z-10' : 'ring-0',
                        showSolved ? 'pointer-events-none' : '',
                      ].join(' ')}
                      style={{
                        backgroundImage: `url(${image})`,
                        backgroundSize: '500% 500%',
                        backgroundPosition: `${col * 25}% ${row * 25}%`,
                      }}
                      aria-label={`tile ${tile + 1}`}
                    />
                  )
                })}
              </div>

              {/* Preview countdown overlay */}
              <AnimatePresence>
                {phase === 'preview' && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 grid place-items-center pointer-events-none"
                  >
                    <motion.span
                      key={countdown}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-6xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    >
                      {countdown}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Win overlay */}
              <AnimatePresence>
                {phase === 'won' && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px] rounded-2xl"
                  >
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                      className="text-center"
                    >
                      <div className="text-5xl">🏆</div>
                      <div className="mt-2 text-2xl font-extrabold text-gradient-warm">{t('games.prSolved')}</div>
                      <div className="mt-1 text-white font-semibold">{t('games.prTimeMoves', { seconds: (elapsed / 1000).toFixed(1), count: moves })}</div>
                    </motion.div>
                    {/* confetti burst */}
                    {['🎉','✨','💖','⭐','🎊','💫'].map((e, i) => (
                      <motion.span
                        key={i}
                        className="absolute text-2xl"
                        initial={{ opacity: 0, x: 0, y: 0 }}
                        animate={{ opacity: [1, 1, 0], x: (i - 3) * 60, y: -120 - i * 10 }}
                        transition={{ duration: 1.1, delay: 0.1 }}
                      >{e}</motion.span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {phase === 'play' && (
              <p className="mt-3 text-center text-[12px] text-ink-muted">{t('games.prTapToSwap')}</p>
            )}
            {phase === 'won' && (
              <div className="mt-4 flex flex-col gap-2 max-w-sm mx-auto">
                <button onClick={playAgain} className="w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose">{t('games.prPlayAgain')}</button>
                <button onClick={() => setPhase('setup')} className="w-full rounded-full py-3 glass text-ink-2 hover:text-ink font-semibold">{t('games.prNewPicture')}</button>
              </div>
            )}
          </Step>
        )}
      </AnimatePresence>
    </Shell>
  )
}

// ---------- shell + bits ----------

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen text-ink pb-24">
      <PopunderAd />
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={onBack} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{t('games.pixelRushTitle')}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6">{children}</main>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="glass rounded-3xl p-5"
    >
      {children}
    </motion.div>
  )
}

// ---------- puzzle helpers ----------

function identity(): number[] {
  return Array.from({ length: N }, (_, i) => i)
}

function isSolved(arr: number[]): boolean {
  return arr.every((v, i) => v === i)
}

function shuffled(): number[] {
  let a = identity()
  do {
    a = identity()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
  } while (isSolved(a))
  return a
}
