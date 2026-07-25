import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../hooks/useGroups'
import { useIsAdmin } from '../hooks/useAdmin'
import {
  useGroupMembers,
  useRemoveGroupMember,
  useSetGroupMemberRole,
  type GroupMember,
} from '../hooks/useGroupMembership'
import { avatarUrlOr } from '../lib/avatar'

export default function GroupManageScreen() {
  const { t } = useTranslation()
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const groupQ = useGroup(slug)
  const platformAdmin = useIsAdmin()
  const group = groupQ.data
  const members = useGroupMembers(group?.id)
  const remove = useRemoveGroupMember(group?.id ?? '')
  const setRole = useSetGroupMemberRole(group?.id ?? '')

  const iAmOwner = group?.my_role === 'owner'
  const canManage = platformAdmin || group?.my_role === 'owner' || group?.my_role === 'admin'

  if (groupQ.status === 'pending') {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }
  if (!group) return <Navigate to="/explore" replace />
  if (!canManage) return <Navigate to={`/g/${slug}`} replace />

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(`/g/${slug}`)} aria-label={t('post.back')} className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold truncate px-2">{t('groups.manage', { name: group.name })}</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold pb-2">
          {t('groups.membersCount', { count: group.member_count })}
        </h2>

        {members.status === 'pending' && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        )}

        {members.status === 'success' && members.data.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-sm text-ink-muted">
            {t('groups.noMembersYet')}
          </div>
        )}

        <ul className="space-y-2">
          {members.data?.map((m) => (
            <MemberRow
              key={m.user_id}
              m={m}
              iAmOwner={iAmOwner}
              busy={remove.isPending || setRole.isPending}
              onRemove={() => {
                if (window.confirm(t('groups.removeConfirm', { handle: m.handle ?? t('groups.thisMember') }))) {
                  remove.mutate(m.user_id)
                }
              }}
              onPromote={() => setRole.mutate({ userId: m.user_id, role: 'admin' })}
              onDemote={() => setRole.mutate({ userId: m.user_id, role: 'member' })}
            />
          ))}
        </ul>
      </main>
    </div>
  )
}

function MemberRow({
  m, iAmOwner, busy, onRemove, onPromote, onDemote,
}: {
  m: GroupMember
  iAmOwner: boolean
  busy: boolean
  onRemove: () => void
  onPromote: () => void
  onDemote: () => void
}) {
  const { t } = useTranslation()
  const isOwner = m.role === 'owner'
  const roleLabel = m.role === 'owner' ? t('groups.roleOwner') : m.role === 'admin' ? t('groups.roleAdmin') : m.role
  return (
    <li className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
      <Link to={`/profile/${m.user_id}`} className="shrink-0">
        <img src={avatarUrlOr(m.avatar_url)} alt="" className="w-11 h-11 rounded-full object-cover" />
      </Link>
      <Link to={`/profile/${m.user_id}`} className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate flex items-center gap-2">
          @{m.handle ?? m.display_name ?? 'unknown'}
          {m.role !== 'member' && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-magenta/15 text-magenta">
              {roleLabel}
            </span>
          )}
        </div>
        {m.display_name && m.handle && (
          <div className="text-[11px] text-ink-muted truncate">{m.display_name}</div>
        )}
      </Link>

      {!isOwner && (
        <div className="flex items-center gap-2 shrink-0">
          {iAmOwner && (
            m.role === 'admin' ? (
              <button
                onClick={onDemote}
                disabled={busy}
                className="rounded-full px-3 py-1 text-xs font-bold glass text-ink-2 hover:text-ink disabled:opacity-60"
              >
                {t('groups.demote')}
              </button>
            ) : (
              <button
                onClick={onPromote}
                disabled={busy}
                className="rounded-full px-3 py-1 text-xs font-bold glass text-ink-2 hover:text-ink disabled:opacity-60"
              >
                {t('groups.makeAdmin')}
              </button>
            )
          )}
          <button
            onClick={onRemove}
            disabled={busy}
            className="rounded-full px-3 py-1 text-xs font-bold glass text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            {t('groups.remove')}
          </button>
        </div>
      )}
    </li>
  )
}
