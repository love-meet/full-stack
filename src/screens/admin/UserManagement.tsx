import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAdminUserSearch,
  useBanUser,
  useIsSuperAdmin,
  useLiftBan,
  useSetRole,
  type AdminUserRow,
} from '../../hooks/useAdmin'
import { avatarUrlOr } from '../../lib/avatar'

export default function UserManagement() {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])

  const users = useAdminUserSearch(q)

  return (
    <div>
      <div className="glass rounded-full px-4 py-2.5 flex items-center gap-2 focus-within:ring-brand transition-shadow">
        <span className="text-ink-muted">⌕</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by handle or display name"
          className="flex-1 bg-transparent outline-none placeholder:text-ink-muted text-sm"
        />
      </div>

      <ul className="mt-4 space-y-2">
        {users.data?.map((u) => <UserRow key={u.id} user={u} />)}
      </ul>

      {users.status === 'success' && users.data.length === 0 && (
        <div className="mt-4 glass rounded-2xl p-6 text-center text-ink-muted text-sm">
          No matches.
        </div>
      )}
    </div>
  )
}

function UserRow({ user }: { user: AdminUserRow }) {
  const ban = useBanUser()
  const lift = useLiftBan()
  const setRole = useSetRole()
  const isSuper = useIsSuperAdmin()
  const [showBan, setShowBan] = useState(false)
  const [reason, setReason] = useState('')

  async function doBan() {
    try {
      await ban.mutateAsync({ userId: user.id, reason: reason.trim() || null })
      setShowBan(false)
      setReason('')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function doLift() {
    try {
      await lift.mutateAsync(user.id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function changeRole(role: 'user' | 'admin' | 'super_admin') {
    if (!isSuper) return
    try {
      await setRole.mutateAsync({ userId: user.id, role })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <img
          src={avatarUrlOr(user.avatar_url)}
          alt=""
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${user.id}`}
              target="_blank"
              className="font-semibold text-ink hover:underline truncate"
            >
              @{user.handle ?? user.display_name ?? user.id.slice(0, 8)}
            </Link>
            {user.role !== 'user' && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-magenta/15 text-magenta">
                {user.role}
              </span>
            )}
            {user.deleted_at && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-danger/15 text-danger">
                deleted
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            {user.display_name} · joined {new Date(user.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => setShowBan((v) => !v)}
          className="rounded-full px-3 py-1 glass text-danger hover:bg-danger/10 font-semibold"
        >
          {showBan ? 'Cancel' : 'Ban'}
        </button>
        <button
          onClick={doLift}
          disabled={lift.isPending}
          className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
        >
          Lift ban
        </button>
        {isSuper && user.role !== 'admin' && (
          <button
            onClick={() => changeRole('admin')}
            className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
          >
            Make admin
          </button>
        )}
        {isSuper && user.role !== 'user' && (
          <button
            onClick={() => changeRole('user')}
            className="rounded-full px-3 py-1 glass text-ink-2 hover:text-ink font-semibold"
          >
            Make user
          </button>
        )}
      </div>

      {showBan && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="lm-input flex-1 text-sm"
          />
          <button
            onClick={doBan}
            disabled={ban.isPending}
            className="rounded-full px-3 py-1.5 text-xs font-bold bg-danger text-white"
          >
            Confirm ban
          </button>
        </div>
      )}
    </li>
  )
}
