import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { stagger, itemUp } from '../../shell/motion'
import { useMyInterests, useUndoGalleryDecision, type InterestRow } from '../../hooks/useGalleryFeed'
import { avatarUrlOr } from '../../lib/avatar'
import { flagImageUrl } from '../../lib/flags'

/**
 * The "Interested" tab beside Messages — everyone whose gallery you marked
 * Interested in.
 *
 * Messaging stays gated on a MUTUAL match (enforced in start_dm, see
 * 0097_gallery_matching.sql), so a row only offers "Message" once they've
 * liked you back. Before that it shows a waiting state and links to their
 * profile — offering a DM button that the database would reject would be
 * worse than not showing one.
 */
export default function InterestedList() {
  const { t } = useTranslation()
  const q = useMyInterests()

  if (q.status === 'pending') {
    return (
      <div className="px-5 sm:px-8 pt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl h-20 animate-pulse" />
        ))}
      </div>
    )
  }

  if (q.status === 'error') {
    return (
      <div className="px-5 sm:px-8 pt-4">
        <div className="glass rounded-2xl p-5 text-sm text-danger">
          {(q.error as Error).message}
        </div>
      </div>
    )
  }

  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <div className="px-8 pt-16 text-center">
        <div className="text-5xl mb-3">💚</div>
        <h2 className="text-lg font-bold text-ink">{t('interested.emptyTitle')}</h2>
        <p className="text-sm text-ink-muted mt-1">{t('interested.emptySubtitle')}</p>
      </div>
    )
  }

  return (
    <motion.ul
      className="px-2 sm:px-5 pt-3 pb-28 space-y-1"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {rows.map((r) => (
        <motion.li key={r.id} variants={itemUp}>
          <InterestRowItem r={r} />
        </motion.li>
      ))}
    </motion.ul>
  )
}

function InterestRowItem({ r }: { r: InterestRow }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const undo = useUndoGalleryDecision()
  const [confirming, setConfirming] = useState(false)
  const name = r.display_name ?? r.handle ?? t('notif.someone')
  const flagSrc = flagImageUrl(r.country_code)
  // Prefer their first gallery photo as the thumbnail — this list is about
  // the gallery you liked, not their avatar.
  const thumb = r.gallery_urls?.find(Boolean) ?? avatarUrlOr(r.avatar_url)

  return (
    <div className="glass rounded-2xl p-3 flex items-center gap-3">
      <Link to={`/profile/${r.id}`} className="shrink-0 active:opacity-70">
        <img src={thumb} alt="" className="w-14 h-14 rounded-xl object-cover" />
      </Link>

      <Link to={`/profile/${r.id}`} className="min-w-0 flex-1 active:opacity-70">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-ink truncate">
            {name}{r.age ? <span className="text-ink-2 font-normal">, {r.age}</span> : null}
          </span>
          {flagSrc && (
            <img src={flagSrc} alt={r.country_code ?? ''} className="h-3 w-auto rounded-sm shrink-0" loading="lazy" />
          )}
        </div>
        <div className="text-[11px] mt-0.5 truncate">
          {r.is_match
            ? <span className="text-success font-semibold">{t('interested.matched')}</span>
            : <span className="text-ink-muted">{t('interested.waiting')}</span>}
        </div>
      </Link>

      {r.is_match && r.conversation_id ? (
        <button
          onClick={() => navigate(`/chat/${r.conversation_id}`)}
          className="shrink-0 rounded-full px-4 py-2 text-xs font-bold bg-gradient-brand text-white glow-rose"
        >
          {t('interested.message')}
        </button>
      ) : (
        <Link
          to={`/profile/${r.id}`}
          className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold glass text-ink-2 hover:text-ink transition-colors"
        >
          {t('interested.viewProfile')}
        </Link>
      )}

      {/* Unlike. Two-step because it's destructive for a match (it drops the
          match for BOTH people), and because a mis-tap would otherwise
          silently undo a like with no way back except finding them again. */}
      {confirming ? (
        <div className="shrink-0 flex items-center gap-1">
          <button
            onClick={() => setConfirming(false)}
            className="rounded-full px-2.5 py-2 text-xs font-semibold glass text-ink-2"
          >
            {t('post.cancel')}
          </button>
          <button
            onClick={() => undo.mutate(r.id)}
            disabled={undo.isPending}
            className="rounded-full px-3 py-2 text-xs font-bold bg-danger text-white disabled:opacity-60"
          >
            {undo.isPending ? '…' : t('interested.confirmUnlike')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label={t('interested.unlike')}
          title={t('interested.unlike')}
          className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  )
}
