import { useState, Fragment } from 'react'
import { motion } from 'framer-motion'
import { useUserPosts } from '../../hooks/useUserPosts'

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
        {active === 'gifts'  && <Empty icon="🎁" label="No gifts received yet." />}
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
              <div key={post.id} className="aspect-square bg-surface overflow-hidden">
                {post.kind === 'image' ? (
                  <img
                    src={post.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video src={post.media_url} className="w-full h-full object-cover" muted playsInline />
                )}
              </div>
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
