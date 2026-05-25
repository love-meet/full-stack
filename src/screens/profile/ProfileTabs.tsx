import { useState, Fragment } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useUserPosts } from '../../hooks/useUserPosts'
import { useReceivedGifts } from '../../hooks/useGift'
import { useUserCurrency } from '../../hooks/useFx'
import { IconImages, IconVideo, IconPlay } from '../../components/icons'

type TabKey = 'posts' | 'gifts' | 'videos' | 'career'

const TABS: { key: TabKey; label: string; disabled?: (isMe: boolean) => boolean }[] = [
  { key: 'posts',   label: 'Posts' },
  { key: 'gifts',   label: 'Gifts',   disabled: (isMe) => !isMe },
  { key: 'videos',  label: 'Videos',  disabled: () => true },
  { key: 'career',  label: 'Career',  disabled: () => true },
]

type Props = { userId: string; isMe: boolean }

export default function ProfileTabs({ userId, isMe }: Props) {
  const [active, setActive] = useState<TabKey>('posts')

  return (
    <div className="pb-32">
      {/* Underline tab bar — mirrors mobile */}
      <div className="flex mx-5 border-b border-white/10">
        {TABS.map((t) => {
          const disabled = t.disabled?.(isMe) ?? false
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setActive(t.key)}
              disabled={disabled}
              className={[
                'relative flex-1 py-3 text-base font-semibold transition-colors',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
                isActive ? 'text-ink' : 'text-ink-muted',
              ].join(' ')}
            >
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-[3px] bg-magenta rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="pt-1">
        {active === 'posts'  && <PostsGrid userId={userId} />}
        {active === 'gifts'  && <GiftsList userId={userId} />}
        {active === 'videos' && <ComingSoon />}
        {active === 'career' && <ComingSoon />}
      </div>
    </div>
  )
}

function PostsGrid({ userId }: { userId: string }) {
  const q = useUserPosts(userId)

  if (q.status === 'pending') {
    return (
      <div className="grid grid-cols-3 gap-px bg-white/5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square bg-surface-2 animate-pulse" />
        ))}
      </div>
    )
  }

  if (q.status === 'error') {
    return <p className="text-center text-danger py-6 text-sm">{(q.error as Error).message}</p>
  }

  const pages = q.data?.pages ?? []
  const total = pages.reduce((n, p) => n + p.length, 0)
  if (total === 0) return <Empty icon="◫" label="No posts yet." />

  return (
    <>
      <div className="grid grid-cols-3 gap-px bg-white/5">
        {pages.map((page, i) => (
          <Fragment key={i}>
            {page.map((post) => (
              <Link key={post.id} to={`/p/${post.id}`} className="relative aspect-square bg-surface overflow-hidden block">
                {post.kind === 'image' ? (
                  <img
                    src={post.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video src={post.media_url} className="w-full h-full object-cover" muted playsInline />
                )}

                {/* Top-right media-type indicator. */}
                <span className="absolute top-1.5 right-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {post.kind === 'image'
                    ? <IconImages size={16} strokeWidth={2.4} />
                    : <IconVideo size={16} strokeWidth={2.4} />}
                </span>

                {/* Center play affordance for videos. */}
                {post.kind !== 'image' && (
                  <span className="absolute inset-0 grid place-items-center pointer-events-none">
                    <span className="w-9 h-9 rounded-full bg-black/45 grid place-items-center text-white">
                      <IconPlay size={18} />
                    </span>
                  </span>
                )}
              </Link>
            ))}
          </Fragment>
        ))}
      </div>
      {q.hasNextPage && (
        <div className="px-5 pt-4">
          <button
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="w-full glass rounded-full py-3 text-sm font-semibold text-ink-2 hover:text-rose transition-colors disabled:opacity-60"
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}

function GiftsList({ userId }: { userId: string }) {
  const q = useReceivedGifts(userId)
  const cur = useUserCurrency()

  if (q.status === 'pending') {
    return (
      <div className="px-5 pt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
        ))}
      </div>
    )
  }
  if (q.status === 'error') {
    return <p className="text-center text-danger py-6 text-sm">{(q.error as Error).message}</p>
  }

  const gifts = q.data ?? []
  if (gifts.length === 0) return <Empty icon="🎁" label="No gifts received yet." />

  return (
    <ul className="px-5 pt-4 space-y-2">
      {gifts.map((g) => {
        const amountUsd = g.amount_cents / 100
        const price = cur.ready || cur.code === 'USD' ? cur.format(amountUsd) : `$${amountUsd}`
        const from = g.sender?.handle ? `@${g.sender.handle}` : g.sender?.display_name ?? 'Someone'
        return (
          <li key={g.id}>
            <Link to={`/gift/${g.id}`} className="glass rounded-2xl p-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0">
                {g.gift_image && <img src={g.gift_image} alt={g.gift_name} className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink truncate">{g.gift_name}</div>
                <div className="text-[11px] text-ink-muted truncate">from {from} · {price}</div>
              </div>
              <GiftStatusTag status={g.status} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function GiftStatusTag({ status }: { status: 'pending' | 'accepted' | 'rejected' | 'failed' }) {
  const map = {
    pending:  { label: 'Pending',  cls: 'bg-gold/15 text-gold' },
    accepted: { label: 'Accepted', cls: 'bg-success/15 text-success' },
    rejected: { label: 'Declined', cls: 'bg-rose/15 text-rose' },
    failed:   { label: 'Failed',   cls: 'bg-rose/15 text-rose' },
  } as const
  const m = map[status]
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${m.cls}`}>
      {m.label}
    </span>
  )
}

function Empty({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="h-48 grid place-items-center text-center">
      <div>
        <div className="text-4xl text-ink-muted mb-2">{icon}</div>
        <p className="text-ink-muted text-sm">{label}</p>
      </div>
    </div>
  )
}

function ComingSoon() {
  return <p className="text-ink-muted text-center py-10 text-base">Coming soon!</p>
}
