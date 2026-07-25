import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCreateGame } from '../../hooks/usePixelGame'
import { PopunderAd } from '../../components/FeedAd'

/** Intro + create flow for Number Duel. Reuses the shared game lobby at
 *  /play/:code — only the gameplay differs. 1v1 only. */
export default function NumberDuelScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createGame = useCreateGame()
  const [err, setErr] = useState<string | null>(null)
  // If reached via the Games-list modal (which already showed the rules),
  // hide the rules block here so the user lands on a focused Host card.
  const skipIntro = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('skip-intro') === '1'

  async function host() {
    setErr(null)
    try {
      const g = await createGame.mutateAsync({ kind: '1v1', type: 'number_duel' })
      navigate(`/play/${g.invite_code}`)
    } catch (e) { setErr((e as Error).message) }
  }

  // Games gate temporarily open — re-enable subscriber check here when
  // paid hosting comes back.

  return (
    <Shell onBack={() => navigate(-1)}>
      <Step>
        <h2 className="text-xl font-extrabold text-gradient-warm">🔢 {t('games.numberDuelTitle')}</h2>
        {!skipIntro && (
          <>
            <p className="text-sm text-ink-2 mt-1">{t('games.numberDuelSubtitle')}</p>
            <ol className="mt-4 space-y-2 text-sm text-ink-2 list-decimal pl-5">
              <li>You each secretly pick a number from <b>0 to 100</b> (e.g. 17, 42, 90).</li>
              <li>Race to guess your opponent's number on the keypad.</li>
              <li>After each guess an arrow says <b>↑ higher</b> or <b>↓ lower</b>.</li>
              <li>First to guess the <b>exact</b> number takes the round.</li>
              <li>Difficulty ramps up: <b>6 Easy</b> rounds (whole numbers), <b>4 Medium</b> (1 decimal), <b>2 Hard</b> (2 decimals).</li>
              <li>Best of 12 takes the trophy. 🏆 Viewers watch both numbers live.</li>
            </ol>
          </>
        )}
        <button onClick={host} disabled={createGame.isPending}
          className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60">
          {createGame.isPending ? t('games.creating') : t('games.create1v1')}
        </button>
        <p className="mt-2 text-[11px] text-ink-muted text-center">{t('games.inviteLinkNote')}</p>
        {err && <p className="mt-3 text-xs text-danger text-center">{err}</p>}
      </Step>
    </Shell>
  )
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen text-ink pb-24">
      <PopunderAd />
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={onBack} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{t('games.numberDuelTitle')}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6">{children}</main>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="glass rounded-3xl p-5">
      {children}
    </motion.div>
  )
}
