import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useBlockedUsers,
  useMutedUsers,
  useUnblockUser,
  useUnmuteUser,
  type RelatedUser,
} from '../../hooks/usePostActions'
import { avatarUrlOr } from '../../lib/avatar'

/** Shared screen for the Blocked-users and Muted-users lists. */
export function BlockedUsersScreen() {
  const { t } = useTranslation()
  const list = useBlockedUsers()
  const unblock = useUnblockUser()
  return (
    <RelationList
      title={t('menu.blockedUsers')}
      emptyIcon="🚫"
      emptyText={t('menu.noBlockedUsers')}
      actionLabel={t('menu.unblock')}
      busy={unblock.isPending}
      users={list.data}
      pending={list.status === 'pending'}
      onAction={(id) => unblock.mutate(id)}
    />
  )
}

export function MutedUsersScreen() {
  const { t } = useTranslation()
  const list = useMutedUsers()
  const unmute = useUnmuteUser()
  return (
    <RelationList
      title={t('menu.mutedUsers')}
      emptyIcon="🔕"
      emptyText={t('menu.noMutedUsers')}
      actionLabel={t('menu.unmute')}
      busy={unmute.isPending}
      users={list.data}
      pending={list.status === 'pending'}
      onAction={(id) => unmute.mutate(id)}
    />
  )
}

function RelationList({
  title, emptyIcon, emptyText, actionLabel, busy, users, pending, onAction,
}: {
  title: string
  emptyIcon: string
  emptyText: string
  actionLabel: string
  busy: boolean
  users: RelatedUser[] | undefined
  pending: boolean
  onAction: (userId: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">{title}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        {pending && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        )}

        {!pending && users && users.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-ink-muted">
            <div className="text-4xl mb-2">{emptyIcon}</div>
            <p className="text-sm">{emptyText}</p>
          </div>
        )}

        <ul className="space-y-2">
          {users?.map((u) => (
            <li key={u.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <Link to={`/profile/${u.id}`} className="shrink-0">
                <img src={avatarUrlOr(u.avatar_url)} alt="" className="w-11 h-11 rounded-full object-cover" />
              </Link>
              <Link to={`/profile/${u.id}`} className="flex-1 min-w-0">
                <div className="font-semibold text-ink truncate">
                  @{u.handle ?? u.display_name ?? 'unknown'}
                </div>
                {u.display_name && u.handle && (
                  <div className="text-[11px] text-ink-muted truncate">{u.display_name}</div>
                )}
              </Link>
              <button
                onClick={() => onAction(u.id)}
                disabled={busy}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold glass text-ink-2 hover:text-ink disabled:opacity-60"
              >
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
